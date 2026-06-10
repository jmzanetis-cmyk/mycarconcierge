// www/custody-capture.js
//
// Reusable custody-photo capture module for member and provider handoff flows.
// Exposes window.CustodyCapture.
//
// Upload flow (per angle):
//   1. User captures via camera (mobile) or file picker (desktop)
//   2. Client-side quality check (brightness + sharpness)
//   3. Quality warnings shown; user may retake or proceed
//   4. GPS captured concurrently with quality check
//   5. File uploaded to custody-evidence bucket at
//        custody/{jobId}/{handoffId}/{photoId}.jpg
//      via supabaseClient.storage (storage RLS still enforces is_job_party)
//   6. Metadata POSTed to /api/custody/photos (feature-flag check + DB insert)
//
// All table writes go through custody.js Netlify endpoints.
// Path strings are constructed here once (step 5) and passed to the endpoint.
// The endpoint validates the same regex — no duplication of the convention.
//
// Requires window.supabaseClient to be initialised before calling any function.

(function () {
  'use strict';

  var CUSTODY_BUCKET = 'custody-evidence';

  var PHOTO_ANGLE_LABELS = {
    front:          'Front of Vehicle',
    rear:           'Rear of Vehicle',
    driver_side:    'Driver Side',
    passenger_side: 'Passenger Side',
    roof:           'Roof',
    wheel_fl:       'Front-Left Wheel',
    wheel_fr:       'Front-Right Wheel',
    wheel_rl:       'Rear-Left Wheel',
    wheel_rr:       'Rear-Right Wheel',
    interior_front: 'Interior – Front Seats',
    interior_rear:  'Interior – Rear Seats',
    cargo:          'Cargo / Boot Area',
    odometer:       'Odometer',
    other:          'Other'
  };

  // Default angle set for a member↔provider handoff (no driver relay).
  var STANDARD_ANGLES = [
    'front', 'rear', 'driver_side', 'passenger_side',
    'odometer', 'interior_front', 'interior_rear'
  ];

  // ── utilities ──────────────────────────────────────────────────────────────

  function generatePhotoId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback: not RFC-compliant but sufficient for path uniqueness
    var s4 = function () { return Math.random().toString(16).slice(2, 6); };
    return [s4() + s4(), s4(), '4' + s4().slice(1), s4(), s4() + s4() + s4()].join('-');
  }

  function readGps() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) {
        return resolve({ lat: null, lng: null, accuracy_m: null });
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy
          });
        },
        function () { resolve({ lat: null, lng: null, accuracy_m: null }); },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
      );
    });
  }

  // Draws the image to a small canvas and computes:
  //   - Average luminance  → 'too_dark' flag if < 50/255
  //   - Laplacian variance → 'blurry' flag if < 5
  //   - quality_score 0–1 combining both
  function analyzeQuality(file) {
    return new Promise(function (resolve) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var maxDim = 200;
          var scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
          var w = Math.max(1, Math.round(img.width  * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          var px = ctx.getImageData(0, 0, w, h).data;
          URL.revokeObjectURL(url);

          var n = w * h;
          var gray = new Float32Array(n);
          var lumSum = 0;
          for (var i = 0; i < n; i++) {
            var ri = i * 4;
            var lum = 0.299 * px[ri] + 0.587 * px[ri + 1] + 0.114 * px[ri + 2];
            gray[i] = lum;
            lumSum += lum;
          }
          var avgLum = lumSum / n;

          // 8-connected Laplacian
          var lapSum = 0, lapN = 0;
          for (var y = 1; y < h - 1; y++) {
            for (var x = 1; x < w - 1; x++) {
              var idx = y * w + x;
              var lap = Math.abs(
                -gray[idx - w - 1] - gray[idx - w] - gray[idx - w + 1]
                - gray[idx - 1]    + 8 * gray[idx] - gray[idx + 1]
                - gray[idx + w - 1] - gray[idx + w] - gray[idx + w + 1]
              );
              lapSum += lap;
              lapN++;
            }
          }
          var sharpness = lapN > 0 ? lapSum / lapN : 0;

          var flags = [];
          if (avgLum  < 50) flags.push('too_dark');
          if (sharpness < 5) flags.push('blurry');

          var score = parseFloat(
            (Math.min(avgLum / 128, 1) * 0.5 + Math.min(sharpness / 20, 1) * 0.5).toFixed(3)
          );

          resolve({ score: score, flags: flags });
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve({ score: null, flags: [] });
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve({ score: null, flags: [] });
      };
      img.src = url;
    });
  }

  // ── capture modal ──────────────────────────────────────────────────────────

  var FLAG_MESSAGES = {
    too_dark: '⚠ Photo appears too dark — try better lighting or move closer to a window.',
    blurry:   '⚠ Photo may be blurry — hold the camera still and try again.'
  };

  // Shows a fullscreen overlay guiding the user through one angle.
  // Returns Promise<{ file, quality, gps, capturedAt }> or null if skipped.
  function captureOneAngle(angleKey, angleIndex, totalAngles) {
    return new Promise(function (resolve) {
      var label = PHOTO_ANGLE_LABELS[angleKey] || angleKey;

      var overlay = document.createElement('div');
      overlay.style.cssText = [
        'position:fixed;inset:0;',
        'background:rgba(0,0,0,0.88);',
        'z-index:10000;',
        'display:flex;align-items:center;justify-content:center;',
        'padding:16px;box-sizing:border-box;'
      ].join('');

      overlay.innerHTML = [
        '<div style="background:var(--bg-elevated,#12122a);border:1px solid var(--border-subtle,#2a2a40);border-radius:14px;padding:24px;max-width:420px;width:100%;color:var(--text-primary,#fff);font-family:inherit;">',
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">',
            '<span style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted,#888);">',
              'Step ' + (angleIndex + 1) + ' of ' + totalAngles,
            '</span>',
            '<span style="font-size:11px;color:var(--text-muted,#888);">Custody Photo</span>',
          '</div>',
          '<h3 style="margin:0 0 18px;font-size:17px;font-weight:600;">' + label + '</h3>',

          '<div id="_cc_preview_wrap" style="display:none;margin-bottom:16px;position:relative;">',
            '<img id="_cc_preview" style="width:100%;border-radius:8px;max-height:230px;object-fit:cover;display:block;" />',
            '<div id="_cc_quality_warn" style="display:none;margin-top:10px;padding:10px 12px;',
              'background:rgba(217,119,6,0.15);border:1px solid rgba(217,119,6,0.4);',
              'border-radius:8px;font-size:13px;line-height:1.5;color:#fbbf24;"></div>',
          '</div>',

          '<div id="_cc_actions" style="display:flex;flex-direction:column;gap:10px;">',
            '<button id="_cc_capture_btn" style="padding:13px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;letter-spacing:.02em;">',
              '📷 Take Photo',
            '</button>',
            '<button id="_cc_skip_btn" style="padding:10px;background:transparent;color:var(--text-muted,#666);',
              'border:1px solid var(--border-subtle,#333);border-radius:8px;font-size:13px;cursor:pointer;">',
              'Skip this angle',
            '</button>',
          '</div>',

          '<div id="_cc_confirm_actions" style="display:none;flex-direction:column;gap:10px;">',
            '<button id="_cc_confirm_btn" style="padding:13px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;">',
              '✓ Looks Good — Next',
            '</button>',
            '<button id="_cc_retake_btn" style="padding:10px;background:transparent;color:var(--text-muted,#aaa);',
              'border:1px solid var(--border-subtle,#444);border-radius:8px;font-size:13px;cursor:pointer;">',
              '↩ Retake',
            '</button>',
          '</div>',
        '</div>'
      ].join('');

      document.body.appendChild(overlay);

      var captureBtn      = overlay.querySelector('#_cc_capture_btn');
      var skipBtn         = overlay.querySelector('#_cc_skip_btn');
      var confirmBtn      = overlay.querySelector('#_cc_confirm_btn');
      var retakeBtn       = overlay.querySelector('#_cc_retake_btn');
      var previewImg      = overlay.querySelector('#_cc_preview');
      var previewWrap     = overlay.querySelector('#_cc_preview_wrap');
      var qualityWarn     = overlay.querySelector('#_cc_quality_warn');
      var actionsDiv      = overlay.querySelector('#_cc_actions');
      var confirmDiv      = overlay.querySelector('#_cc_confirm_actions');

      var currentFile     = null;
      var currentQuality  = null;
      var currentGps      = null;
      var currentCaptured = null;

      function closeWith(value) {
        document.body.removeChild(overlay);
        resolve(value);
      }

      function showPreview(file) {
        var objUrl = URL.createObjectURL(file);
        previewImg.onload = function () { URL.revokeObjectURL(objUrl); };
        previewImg.src = objUrl;
        previewWrap.style.display = 'block';
      }

      function showConfirmActions(quality) {
        actionsDiv.style.display = 'none';
        confirmDiv.style.display = 'flex';

        if (quality && quality.flags && quality.flags.length > 0) {
          qualityWarn.innerHTML = quality.flags
            .map(function (f) { return FLAG_MESSAGES[f] || f; })
            .join('<br>');
          qualityWarn.style.display = 'block';
          // Re-label confirm button to make retake feel encouraged
          confirmBtn.textContent = 'Use Anyway — Next';
          confirmBtn.style.background = '#b45309';
        } else {
          qualityWarn.style.display = 'none';
          confirmBtn.textContent = '✓ Looks Good — Next';
          confirmBtn.style.background = '#16a34a';
        }
      }

      function triggerFileCapture() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.setAttribute('capture', 'environment');
        input.style.cssText = 'position:absolute;opacity:0;pointer-events:none;';
        document.body.appendChild(input);

        input.onchange = function () {
          document.body.removeChild(input);
          if (!input.files || !input.files[0]) return;

          var file = input.files[0];
          var capturedAt = new Date().toISOString();

          showPreview(file);

          // GPS and quality check run concurrently
          Promise.all([analyzeQuality(file), readGps()]).then(function (results) {
            currentFile     = file;
            currentQuality  = results[0];
            currentGps      = results[1];
            currentCaptured = capturedAt;
            showConfirmActions(currentQuality);
          });
        };

        // Let the overlay stay in the DOM while the file picker is open
        input.click();
      }

      captureBtn.addEventListener('click', triggerFileCapture);

      skipBtn.addEventListener('click', function () { closeWith(null); });

      retakeBtn.addEventListener('click', function () {
        confirmDiv.style.display = 'none';
        actionsDiv.style.display = 'flex';
        previewWrap.style.display = 'none';
        currentFile = null;
        triggerFileCapture();
      });

      confirmBtn.addEventListener('click', function () {
        if (currentFile) {
          closeWith({
            file:        currentFile,
            quality:     currentQuality,
            gps:         currentGps,
            capturedAt:  currentCaptured
          });
        }
      });

      // Trigger camera immediately on open
      triggerFileCapture();
    });
  }

  // ── storage + API ──────────────────────────────────────────────────────────

  // Uploads the file to the custody-evidence bucket.
  // Path: custody/{jobId}/{handoffId}/{photoId}.jpg
  // This is the ONLY place in www/ where this path is constructed.
  // custody.js validates the same regex; it never constructs paths.
  async function uploadToStorage(supabase, jobId, handoffId, photoId, file) {
    var path = 'custody/' + jobId + '/' + handoffId + '/' + photoId + '.jpg';
    var up = await supabase.storage
      .from(CUSTODY_BUCKET)
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
    if (up.error) throw up.error;
    return path;
  }

  async function postPhotoMetadata(token, handoffId, jobId, photoId, storagePath, capturedByRole, angle, capturedAt, gps, quality) {
    var res = await fetch('/api/custody/photos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        id:               photoId,
        handoff_id:       handoffId,
        job_id:           jobId,
        angle:            angle,
        storage_path:     storagePath,
        captured_by_role: capturedByRole,
        captured_at:      capturedAt,
        gps_lat:          gps ? gps.lat        : null,
        gps_lng:          gps ? gps.lng        : null,
        gps_accuracy_m:   gps ? gps.accuracy_m : null,
        live_capture:     true,
        quality_score:    quality ? quality.score : null,
        quality_flags:    quality ? (quality.flags || []) : []
      })
    });
    if (!res.ok) {
      var body = await res.json().catch(function () { return {}; });
      throw new Error(body.error || 'Photo metadata POST failed (' + res.status + ')');
    }
    return res.json();
  }

  // ── main export ────────────────────────────────────────────────────────────

  // captureHandoffPhotos(handoffId, jobId, capturedByRole, requiredAngles?)
  //
  // Walks the user through each angle in sequence. Returns:
  //   { photos: [{angle, photo_id, storage_path, metadata}], failed: [{angle, error}] }
  //
  // Skipped angles are silently omitted from both arrays.
  // Any angle that errors (storage upload failure, API 403, etc.) lands in failed[].

  async function captureHandoffPhotos(handoffId, jobId, capturedByRole, requiredAngles) {
    if (!window.supabaseClient) {
      throw new Error('supabaseClient not available');
    }

    var sessionRes = await window.supabaseClient.auth.getSession();
    var session    = sessionRes.data && sessionRes.data.session;
    if (!session || !session.access_token) {
      throw new Error('No active session — cannot upload photos');
    }
    var token = session.access_token;

    var angles = Array.isArray(requiredAngles) && requiredAngles.length > 0
      ? requiredAngles
      : STANDARD_ANGLES;

    var photos  = [];
    var failed  = [];

    for (var i = 0; i < angles.length; i++) {
      var angle = angles[i];
      var captured = null;

      try {
        captured = await captureOneAngle(angle, i, angles.length);
      } catch (e) {
        failed.push({ angle: angle, error: 'Capture UI error: ' + e.message });
        continue;
      }

      if (!captured) continue; // user skipped

      var photoId = generatePhotoId();

      try {
        var storagePath = await uploadToStorage(
          window.supabaseClient, jobId, handoffId, photoId, captured.file
        );

        var metaRes = await postPhotoMetadata(
          token, handoffId, jobId, photoId, storagePath,
          capturedByRole, angle,
          captured.capturedAt, captured.gps, captured.quality
        );

        photos.push({
          angle:        angle,
          photo_id:     photoId,
          storage_path: storagePath,
          metadata:     metaRes.photo || null
        });
      } catch (e) {
        failed.push({ angle: angle, error: e.message });
      }
    }

    return { photos: photos, failed: failed };
  }

  // ── namespace ──────────────────────────────────────────────────────────────

  window.CustodyCapture = {
    captureHandoffPhotos: captureHandoffPhotos,
    STANDARD_ANGLES:      STANDARD_ANGLES,
    PHOTO_ANGLE_LABELS:   PHOTO_ANGLE_LABELS
  };

}());
