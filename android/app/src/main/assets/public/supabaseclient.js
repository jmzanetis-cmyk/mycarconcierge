// VERSION: DEC25-FIX-V2 - ROBUST INITIALIZATION WITH RETRY
const SUPABASE_URL = "https://ifbyjxuaclwmadqbjcyp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmYnlqeHVhY2x3bWFkcWJqY3lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDI0OTUsImV4cCI6MjA4MDQ3ODQ5NX0.wts2W0ICqTSCUpF9ewvEk59P2A0stvqqmP0CNsPfIt8";

let supabaseClient;

function initSupabaseClient() {
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        storageKey: 'sb-ifbyjxuaclwmadqbjcyp-auth-token',
        storage: window.localStorage,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    window.supabaseClient = supabaseClient;
    return true;
  }
  return false;
}

// Try immediate initialization
if (!initSupabaseClient()) {
  // Retry with short delay if library not loaded yet
  let retries = 0;
  const maxRetries = 50; // 5 seconds max wait
  const retryInterval = setInterval(() => {
    if (initSupabaseClient()) {
      clearInterval(retryInterval);
      console.log('Supabase client initialized after retry');
    } else if (++retries >= maxRetries) {
      clearInterval(retryInterval);
      console.error('Supabase library failed to load after retries');
    }
  }, 100);
}

async function getCurrentUser() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) {
    // Don't log "session missing" errors - this is expected when user isn't logged in
    if (error.name !== 'AuthSessionMissingError') {
      console.error("Error getting user", error);
    }
    return null;
  }
  return data?.user ?? null;
}

window.getCurrentUser = getCurrentUser;

// ------- DOCUMENT EXPIRATION HELPERS -------

const DOCUMENT_VALIDITY_DAYS = 365; // 1 year
const EXPIRATION_WARNING_DAYS = 30; // Warn 30 days before expiration

function getExpirationDate(uploadDate) {
  const expDate = new Date(uploadDate);
  expDate.setDate(expDate.getDate() + DOCUMENT_VALIDITY_DAYS);
  return expDate;
}

function isDocumentExpired(uploadDate) {
  if (!uploadDate) return false;
  const expDate = getExpirationDate(uploadDate);
  return new Date() > expDate;
}

function isDocumentExpiringSoon(uploadDate) {
  if (!uploadDate) return false;
  const expDate = getExpirationDate(uploadDate);
  const warningDate = new Date();
  warningDate.setDate(warningDate.getDate() + EXPIRATION_WARNING_DAYS);
  return new Date() <= expDate && warningDate >= expDate;
}

function getDaysUntilExpiration(uploadDate) {
  if (!uploadDate) return null;
  const expDate = getExpirationDate(uploadDate);
  const now = new Date();
  const diffTime = expDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getExpirationStatus(uploadDate) {
  if (!uploadDate) return { status: 'unknown', label: 'Unknown', class: '' };
  const daysLeft = getDaysUntilExpiration(uploadDate);
  if (daysLeft <= 0) {
    return { status: 'expired', label: 'Expired', class: 'expired', daysLeft: 0 };
  } else if (daysLeft <= EXPIRATION_WARNING_DAYS) {
    return { status: 'expiring_soon', label: `Expires in ${daysLeft} days`, class: 'expiring-soon', daysLeft };
  } else {
    return { status: 'valid', label: `Valid for ${daysLeft} days`, class: 'valid', daysLeft };
  }
}

window.getExpirationDate = getExpirationDate;
window.isDocumentExpired = isDocumentExpired;
window.isDocumentExpiringSoon = isDocumentExpiringSoon;
window.getDaysUntilExpiration = getDaysUntilExpiration;
window.getExpirationStatus = getExpirationStatus;
window.DOCUMENT_VALIDITY_DAYS = DOCUMENT_VALIDITY_DAYS;
window.EXPIRATION_WARNING_DAYS = EXPIRATION_WARNING_DAYS;

// ------- IMAGE RESIZE HELPER -------

async function resizeImage(file, maxSize = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxSize && height <= maxSize) {
        URL.revokeObjectURL(url);
        return resolve(file);
      }

      const canvas = document.createElement("canvas");
      if (width > height) {
        canvas.width = maxSize;
        canvas.height = (height / width) * maxSize;
      } else {
        canvas.height = maxSize;
        canvas.width = (width / height) * maxSize;
      }

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(blob);
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

// ------- VEHICLE PHOTOS -------

async function uploadVehiclePhoto(vehicleId, file) {
  if (!file || !vehicleId) return { error: "Missing file or vehicleId" };
  const resizedBlob = await resizeImage(file, 1280, 0.8);
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `${vehicleId}/${filename}`;
  const { data, error } = await supabaseClient.storage
    .from("vehicle-files")
    .upload(path, resizedBlob, { cacheControl: "3600", upsert: false, contentType: file.type || "image/jpeg" });
  return { data, error };
}

async function listVehiclePhotos(vehicleId) {
  if (!vehicleId) return { data: [], error: null };
  const { data, error } = await supabaseClient.storage
    .from("vehicle-files")
    .list(vehicleId, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error || !data) return { data: [], error };
  const urls = data.map((f) => {
    const { data: publicData } = supabaseClient.storage.from("vehicle-files").getPublicUrl(`${vehicleId}/${f.name}`);
    const expStatus = getExpirationStatus(f.created_at);
    return { 
      name: f.name, 
      url: publicData.publicUrl, 
      created_at: f.created_at,
      expires_at: getExpirationDate(f.created_at),
      expiration: expStatus
    };
  });
  return { data: urls, error: null };
}

async function deleteVehiclePhoto(vehicleId, filename) {
  if (!vehicleId || !filename) return;
  await supabaseClient.storage.from("vehicle-files").remove([`${vehicleId}/${filename}`]);
}

// ------- PACKAGE PHOTOS -------

async function uploadPackagePhoto(packageId, file) {
  if (!file || !packageId) return { error: "Missing file or packageId" };
  const resizedBlob = await resizeImage(file, 1280, 0.8);
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `${packageId}/${filename}`;
  const { data, error } = await supabaseClient.storage
    .from("package-photos")
    .upload(path, resizedBlob, { cacheControl: "3600", upsert: false, contentType: file.type || "image/jpeg" });
  return { data, error };
}

async function listPackagePhotos(packageId) {
  if (!packageId) return { data: [], error: null };
  const { data, error } = await supabaseClient.storage
    .from("package-photos")
    .list(packageId, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error || !data) return { data: [], error };
  const urls = data.map((f) => {
    const { data: publicData } = supabaseClient.storage.from("package-photos").getPublicUrl(`${packageId}/${f.name}`);
    const expStatus = getExpirationStatus(f.created_at);
    return { 
      name: f.name, 
      url: publicData.publicUrl,
      created_at: f.created_at,
      expires_at: getExpirationDate(f.created_at),
      expiration: expStatus
    };
  });
  return { data: urls, error: null };
}

async function deletePackagePhoto(packageId, filename) {
  if (!packageId || !filename) return;
  await supabaseClient.storage.from("package-photos").remove([`${packageId}/${filename}`]);
}

// ------- DOCUMENT STORAGE (for Digital Garage) -------

async function uploadVehicleDocument(vehicleId, file, docType) {
  if (!file || !vehicleId) return { error: "Missing file or vehicleId" };
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  const filename = `${docType}_${crypto.randomUUID()}.${ext}`;
  const path = `${vehicleId}/docs/${filename}`;
  const { data, error } = await supabaseClient.storage
    .from("vehicle-files")
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || "application/pdf" });
  return { data, error, filename };
}

async function listVehicleDocuments(vehicleId) {
  if (!vehicleId) return { data: [], error: null };
  const { data, error } = await supabaseClient.storage
    .from("vehicle-files")
    .list(`${vehicleId}/docs`, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error || !data) return { data: [], error };
  const urls = data.map((f) => {
    const { data: publicData } = supabaseClient.storage.from("vehicle-files").getPublicUrl(`${vehicleId}/docs/${f.name}`);
    const expStatus = getExpirationStatus(f.created_at);
    return { 
      name: f.name, 
      url: publicData.publicUrl,
      created_at: f.created_at,
      expires_at: getExpirationDate(f.created_at),
      expiration: expStatus
    };
  });
  return { data: urls, error: null };
}

// Export all functions
window.uploadVehiclePhoto = uploadVehiclePhoto;
window.listVehiclePhotos = listVehiclePhotos;
window.deleteVehiclePhoto = deleteVehiclePhoto;
window.uploadPackagePhoto = uploadPackagePhoto;
window.listPackagePhotos = listPackagePhotos;
window.deletePackagePhoto = deletePackagePhoto;
window.uploadVehicleDocument = uploadVehicleDocument;
window.listVehicleDocuments = listVehicleDocuments;

// ------- NOTIFICATIONS -------

async function createNotification(userId, type, title, message, linkType = null, linkId = null) {
  const { data, error } = await supabaseClient.from('notifications').insert({
    user_id: userId,
    type: type,
    title: title,
    message: message,
    link_type: linkType,
    link_id: linkId,
    read: false
  }).select().single();
  
  if (error) {
    console.error('Error creating notification:', error);
  }
  return { data, error };
}

async function getNotifications(userId, limit = 20) {
  const { data, error } = await supabaseClient
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  return { data: data || [], error };
}

async function markNotificationRead(notificationId) {
  const { error } = await supabaseClient
    .from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId);
  
  return { error };
}

async function markAllNotificationsRead(userId) {
  const { error } = await supabaseClient
    .from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('read', false);
  
  return { error };
}

async function getUnreadCount(userId) {
  const { count, error } = await supabaseClient
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);
  
  return { count: count || 0, error };
}

// Trigger notification when bid is submitted (call from provider side)
async function notifyBidReceived(packageId, bidAmount, providerId) {
  // Get package details
  const { data: pkg } = await supabaseClient
    .from('maintenance_packages')
    .select('member_id, title, vehicles(year, make, model)')
    .eq('id', packageId)
    .single();
  
  if (!pkg) return;
  
  const vehicleName = pkg.vehicles ? `${pkg.vehicles.year} ${pkg.vehicles.make} ${pkg.vehicles.model}` : 'Your vehicle';
  
  await createNotification(
    pkg.member_id,
    'bid_received',
    'New Bid Received',
    `You received a $${bidAmount.toFixed(2)} bid on "${pkg.title}" for ${vehicleName}`,
    'package',
    packageId
  );
}

// Trigger notification when bid is accepted (call from member side)
async function notifyBidAccepted(bidId, packageId) {
  const { data: bid } = await supabaseClient
    .from('bids')
    .select('provider_id, price, maintenance_packages(title)')
    .eq('id', bidId)
    .single();
  
  if (!bid) return;
  
  await createNotification(
    bid.provider_id,
    'bid_accepted',
    'Bid Accepted! 🎉',
    `Your $${bid.price.toFixed(2)} bid on "${bid.maintenance_packages.title}" was accepted!`,
    'package',
    packageId
  );
}

// Trigger notification when work starts
async function notifyWorkStarted(packageId) {
  const { data: pkg } = await supabaseClient
    .from('maintenance_packages')
    .select('member_id, title, accepted_bid_id, bids!accepted_bid_id(provider_id, profiles:provider_id(business_name, full_name))')
    .eq('id', packageId)
    .single();
  
  if (!pkg) return;
  
  const providerName = pkg.bids?.profiles?.business_name || pkg.bids?.profiles?.full_name || 'Your provider';
  
  await createNotification(
    pkg.member_id,
    'work_started',
    'Work Has Started 🔧',
    `${providerName} has started work on "${pkg.title}"`,
    'package',
    packageId
  );
}

// Trigger notification when work completes
async function notifyWorkCompleted(packageId) {
  const { data: pkg } = await supabaseClient
    .from('maintenance_packages')
    .select('member_id, title')
    .eq('id', packageId)
    .single();
  
  if (!pkg) return;
  
  await createNotification(
    pkg.member_id,
    'work_completed',
    'Work Complete - Confirm & Pay',
    `"${pkg.title}" has been marked complete. Please confirm to release payment.`,
    'package',
    packageId
  );
}

// Trigger notification for new message
async function notifyNewMessage(recipientId, senderName, packageTitle, packageId) {
  await createNotification(
    recipientId,
    'new_message',
    `New Message from ${senderName}`,
    `Regarding: ${packageTitle}`,
    'message',
    packageId
  );
}

window.createNotification = createNotification;
window.getNotifications = getNotifications;
window.markNotificationRead = markNotificationRead;
window.markAllNotificationsRead = markAllNotificationsRead;
window.getUnreadCount = getUnreadCount;
window.notifyBidReceived = notifyBidReceived;
window.notifyBidAccepted = notifyBidAccepted;
window.notifyWorkStarted = notifyWorkStarted;
window.notifyWorkCompleted = notifyWorkCompleted;
window.notifyNewMessage = notifyNewMessage;

// =====================================================
// SERVICE SCHEDULING & COORDINATION FUNCTIONS
// =====================================================

// ------- SERVICE APPOINTMENTS -------

async function createAppointment(packageId, memberId, providerId, proposedDate, proposedTimeStart, proposedTimeEnd, estimatedDays, notes) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };
  
  const proposedBy = user.id === memberId ? 'member' : 'provider';
  
  const { data, error } = await supabaseClient
    .from('service_appointments')
    .insert({
      package_id: packageId,
      member_id: memberId,
      provider_id: providerId,
      proposed_date: proposedDate,
      proposed_time_start: proposedTimeStart || null,
      proposed_time_end: proposedTimeEnd || null,
      estimated_days: estimatedDays || null,
      proposed_by: proposedBy,
      member_notes: proposedBy === 'member' ? notes : null,
      provider_notes: proposedBy === 'provider' ? notes : null,
      status: 'proposed'
    })
    .select()
    .single();
  
  if (!error && data) {
    await supabaseClient
      .from('maintenance_packages')
      .update({ current_appointment_id: data.id, logistics_status: 'pending' })
      .eq('id', packageId);
    
    const recipientId = proposedBy === 'member' ? providerId : memberId;
    await createNotification(
      recipientId,
      'appointment_proposed',
      'New Appointment Proposed 📅',
      `A service appointment has been proposed for ${proposedDate}. Please review and confirm.`,
      'package',
      packageId
    );
  }
  
  return { data, error };
}

async function getAppointment(packageId) {
  const { data, error } = await supabaseClient
    .from('service_appointments')
    .select('*')
    .eq('package_id', packageId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  return { data, error };
}

async function confirmAppointment(appointmentId, packageId) {
  const { data: appt } = await supabaseClient
    .from('service_appointments')
    .select('proposed_date, proposed_time_start, proposed_time_end, member_id, provider_id, proposed_by')
    .eq('id', appointmentId)
    .single();
  
  if (!appt) return { error: 'Appointment not found' };
  
  const { data, error } = await supabaseClient
    .from('service_appointments')
    .update({
      status: 'confirmed',
      confirmed_date: appt.proposed_date,
      confirmed_time_start: appt.proposed_time_start,
      confirmed_time_end: appt.proposed_time_end,
      confirmed_at: new Date().toISOString()
    })
    .eq('id', appointmentId)
    .select()
    .single();
  
  if (!error) {
    await supabaseClient
      .from('maintenance_packages')
      .update({ logistics_status: 'scheduled' })
      .eq('id', packageId);
    
    const user = await getCurrentUser();
    const recipientId = user.id === appt.member_id ? appt.provider_id : appt.member_id;
    await createNotification(
      recipientId,
      'appointment_confirmed',
      'Appointment Confirmed ✅',
      `Service appointment confirmed for ${appt.proposed_date}.`,
      'package',
      packageId
    );
  }
  
  return { data, error };
}

async function proposeNewTime(appointmentId, packageId, newDate, newTimeStart, newTimeEnd, notes) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };
  
  const { data: appt } = await supabaseClient
    .from('service_appointments')
    .select('member_id, provider_id')
    .eq('id', appointmentId)
    .single();
  
  const counterBy = user.id === appt.member_id ? 'member' : 'provider';
  
  const { data, error } = await supabaseClient
    .from('service_appointments')
    .update({
      counter_proposed_date: newDate,
      counter_proposed_time_start: newTimeStart || null,
      counter_proposed_time_end: newTimeEnd || null,
      counter_proposed_by: counterBy,
      counter_notes: notes || null,
      status: 'rescheduled'
    })
    .eq('id', appointmentId)
    .select()
    .single();
  
  if (!error) {
    const recipientId = counterBy === 'member' ? appt.provider_id : appt.member_id;
    await createNotification(
      recipientId,
      'appointment_rescheduled',
      'New Time Proposed 📅',
      `A new service time has been proposed for ${newDate}. Please review.`,
      'package',
      packageId
    );
  }
  
  return { data, error };
}

async function acceptCounterProposal(appointmentId, packageId) {
  const { data: appt } = await supabaseClient
    .from('service_appointments')
    .select('counter_proposed_date, counter_proposed_time_start, counter_proposed_time_end, member_id, provider_id')
    .eq('id', appointmentId)
    .single();
  
  if (!appt || !appt.counter_proposed_date) return { error: 'No counter proposal found' };
  
  const { data, error } = await supabaseClient
    .from('service_appointments')
    .update({
      proposed_date: appt.counter_proposed_date,
      proposed_time_start: appt.counter_proposed_time_start,
      proposed_time_end: appt.counter_proposed_time_end,
      confirmed_date: appt.counter_proposed_date,
      confirmed_time_start: appt.counter_proposed_time_start,
      confirmed_time_end: appt.counter_proposed_time_end,
      confirmed_at: new Date().toISOString(),
      status: 'confirmed',
      counter_proposed_date: null,
      counter_proposed_time_start: null,
      counter_proposed_time_end: null
    })
    .eq('id', appointmentId)
    .select()
    .single();
  
  if (!error) {
    await supabaseClient
      .from('maintenance_packages')
      .update({ logistics_status: 'scheduled' })
      .eq('id', packageId);
    
    const user = await getCurrentUser();
    const recipientId = user.id === appt.member_id ? appt.provider_id : appt.member_id;
    await createNotification(
      recipientId,
      'appointment_confirmed',
      'Appointment Confirmed ✅',
      `Service appointment confirmed for ${appt.counter_proposed_date}.`,
      'package',
      packageId
    );
  }
  
  return { data, error };
}

// ------- VEHICLE TRANSFERS -------

async function createVehicleTransfer(packageId, memberId, providerId, transferType, pickupAddress, pickupNotes, returnAddress, specialInstructions) {
  const { data, error } = await supabaseClient
    .from('vehicle_transfers')
    .insert({
      package_id: packageId,
      member_id: memberId,
      provider_id: providerId,
      transfer_type: transferType,
      pickup_address: pickupAddress || null,
      pickup_notes: pickupNotes || null,
      return_address: returnAddress || null,
      special_instructions: specialInstructions || null,
      vehicle_status: 'with_member'
    })
    .select()
    .single();
  
  if (!error && data) {
    await supabaseClient
      .from('maintenance_packages')
      .update({ current_transfer_id: data.id })
      .eq('id', packageId);
  }
  
  return { data, error };
}

async function getVehicleTransfer(packageId) {
  const { data, error } = await supabaseClient
    .from('vehicle_transfers')
    .select('*')
    .eq('package_id', packageId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  return { data, error };
}

async function updateVehicleStatus(transferId, packageId, newStatus, additionalData = {}) {
  const statusTimestamps = {
    'in_transit_to_provider': {},
    'at_provider': { arrived_at_provider_at: new Date().toISOString() },
    'work_in_progress': { work_started_at: new Date().toISOString() },
    'work_complete': { work_completed_at: new Date().toISOString() },
    'ready_for_return': { ready_for_return_at: new Date().toISOString() },
    'in_transit_to_member': {},
    'returned': { returned_at: new Date().toISOString() }
  };
  
  const logisticsStatusMap = {
    'in_transit_to_provider': 'vehicle_in_transit',
    'at_provider': 'at_provider',
    'work_in_progress': 'work_in_progress',
    'work_complete': 'work_complete',
    'ready_for_return': 'ready_for_return',
    'in_transit_to_member': 'returning',
    'returned': 'completed'
  };
  
  const { data, error } = await supabaseClient
    .from('vehicle_transfers')
    .update({
      vehicle_status: newStatus,
      ...statusTimestamps[newStatus],
      ...additionalData
    })
    .eq('id', transferId)
    .select()
    .single();
  
  if (!error && logisticsStatusMap[newStatus]) {
    await supabaseClient
      .from('maintenance_packages')
      .update({ logistics_status: logisticsStatusMap[newStatus] })
      .eq('id', packageId);
  }
  
  if (!error && data) {
    const { data: transfer } = await supabaseClient
      .from('vehicle_transfers')
      .select('member_id, provider_id')
      .eq('id', transferId)
      .single();
    
    const user = await getCurrentUser();
    const recipientId = user.id === transfer.member_id ? transfer.provider_id : transfer.member_id;
    
    const statusMessages = {
      'in_transit_to_provider': 'Vehicle is on the way to the provider',
      'at_provider': 'Vehicle has arrived at the provider',
      'work_in_progress': 'Work has started on your vehicle',
      'work_complete': 'Work is complete on your vehicle',
      'ready_for_return': 'Vehicle is ready for return/pickup',
      'in_transit_to_member': 'Vehicle is on the way back',
      'returned': 'Vehicle has been returned'
    };
    
    await createNotification(
      recipientId,
      'vehicle_status_update',
      'Vehicle Status Update 🚗',
      statusMessages[newStatus] || `Vehicle status: ${newStatus}`,
      'package',
      packageId
    );
  }
  
  return { data, error };
}

async function confirmPickup(transferId, packageId, confirmedBy) {
  const { data, error } = await supabaseClient
    .from('vehicle_transfers')
    .update({
      pickup_completed_at: new Date().toISOString(),
      pickup_confirmed_by: confirmedBy,
      vehicle_status: 'at_provider'
    })
    .eq('id', transferId)
    .select()
    .single();
  
  if (!error) {
    await supabaseClient
      .from('maintenance_packages')
      .update({ logistics_status: 'at_provider' })
      .eq('id', packageId);
  }
  
  return { data, error };
}

async function confirmReturn(transferId, packageId, confirmedBy) {
  const { data, error } = await supabaseClient
    .from('vehicle_transfers')
    .update({
      return_completed_at: new Date().toISOString(),
      return_confirmed_by: confirmedBy,
      vehicle_status: 'returned'
    })
    .eq('id', transferId)
    .select()
    .single();
  
  if (!error) {
    await supabaseClient
      .from('maintenance_packages')
      .update({ logistics_status: 'completed' })
      .eq('id', packageId);
  }
  
  return { data, error };
}

// ------- LOCATION SHARING -------

async function shareLocation(packageId, sharedWithId, context = 'general', message = null) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      resolve({ error: 'Geolocation not supported by this browser' });
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
        
        let addressText = null;
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const geocode = await response.json();
          if (geocode.display_name) {
            addressText = geocode.display_name;
          }
        } catch (e) {
          console.log('Geocoding failed, using coordinates only');
        }
        
        const user = await getCurrentUser();
        
        await supabaseClient
          .from('location_shares')
          .update({ is_active: false })
          .eq('package_id', packageId)
          .eq('shared_by', user.id)
          .eq('shared_with', sharedWithId);
        
        const { data, error } = await supabaseClient
          .from('location_shares')
          .insert({
            package_id: packageId,
            shared_by: user.id,
            shared_with: sharedWithId,
            latitude: latitude,
            longitude: longitude,
            accuracy: accuracy,
            address_text: addressText,
            maps_link: mapsLink,
            context: context,
            message: message,
            expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
          })
          .select()
          .single();
        
        if (!error) {
          const { data: pkg } = await supabaseClient
            .from('maintenance_packages')
            .select('title')
            .eq('id', packageId)
            .single();
          
          await createNotification(
            sharedWithId,
            'location_shared',
            'Location Shared 📍',
            `A location has been shared with you for "${pkg?.title || 'your service'}". ${message || ''}`,
            'package',
            packageId
          );
        }
        
        resolve({ data, error, mapsLink });
      },
      (error) => {
        let errorMessage = 'Unable to get location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out.';
            break;
        }
        resolve({ error: errorMessage });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  });
}

async function getActiveLocationShare(packageId) {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };
  
  const { data, error } = await supabaseClient
    .from('location_shares')
    .select('*, profiles:shared_by(full_name, business_name, provider_alias)')
    .eq('package_id', packageId)
    .eq('shared_with', user.id)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .order('shared_at', { ascending: false })
    .limit(1)
    .single();
  
  return { data, error };
}

async function deactivateLocationShare(shareId) {
  const { data, error } = await supabaseClient
    .from('location_shares')
    .update({ is_active: false })
    .eq('id', shareId)
    .select()
    .single();
  
  return { data, error };
}

async function markLocationViewed(shareId) {
  const { data, error } = await supabaseClient
    .from('location_shares')
    .update({ viewed_at: new Date().toISOString() })
    .eq('id', shareId)
    .select()
    .single();
  
  return { data, error };
}

// ========== PROVIDER RATING & SUSPENSION ==========

async function checkProviderSuspension(providerId) {
  const { data, error } = await supabaseClient.rpc('check_provider_suspension', {
    p_provider_id: providerId
  });
  return { data, error };
}

async function isProviderSuspended(providerId) {
  const { data, error } = await supabaseClient.rpc('is_provider_suspended', {
    p_provider_id: providerId
  });
  return { data, error };
}

async function getProviderReviewsSummary(providerId) {
  const { data, error } = await supabaseClient.rpc('get_provider_reviews_summary', {
    p_provider_id: providerId
  });
  return { data: data?.[0] || null, error };
}

async function getProviderReviews(providerId, limit = 10, offset = 0) {
  const { data, error } = await supabaseClient
    .from('provider_reviews')
    .select(`
      *,
      member:member_id(full_name),
      package:package_id(title, category)
    `)
    .eq('provider_id', providerId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  return { data, error };
}

async function submitProviderReview(reviewData) {
  const { data, error } = await supabaseClient
    .from('provider_reviews')
    .insert(reviewData)
    .select()
    .single();
  
  if (error) return { data: null, error };
  
  const suspensionResult = await checkProviderSuspension(reviewData.provider_id);
  
  return { 
    data, 
    error: null, 
    suspensionCheck: suspensionResult.data 
  };
}

async function getProviderCreditRefunds(providerId) {
  const { data, error } = await supabaseClient
    .from('credit_refunds')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });
  
  return { data, error };
}

async function canProviderBid(providerId) {
  const suspensionStatus = await isProviderSuspended(providerId);
  
  if (suspensionStatus.error) {
    return { canBid: true, error: suspensionStatus.error };
  }
  
  const isSuspended = suspensionStatus.data?.suspended || false;
  
  return {
    canBid: !isSuspended,
    suspended: isSuspended,
    reason: suspensionStatus.data?.reason || null,
    currentRating: suspensionStatus.data?.current_rating || null
  };
}

// Export scheduling and coordination functions
window.createAppointment = createAppointment;
window.getAppointment = getAppointment;
window.confirmAppointment = confirmAppointment;
window.proposeNewTime = proposeNewTime;
window.acceptCounterProposal = acceptCounterProposal;
window.createVehicleTransfer = createVehicleTransfer;
window.getVehicleTransfer = getVehicleTransfer;
window.updateVehicleStatus = updateVehicleStatus;
window.confirmPickup = confirmPickup;
window.confirmReturn = confirmReturn;
window.shareLocation = shareLocation;
window.getActiveLocationShare = getActiveLocationShare;
window.deactivateLocationShare = deactivateLocationShare;
window.markLocationViewed = markLocationViewed;

// Export rating and suspension functions
window.checkProviderSuspension = checkProviderSuspension;
window.isProviderSuspended = isProviderSuspended;
window.getProviderReviewsSummary = getProviderReviewsSummary;
window.getProviderReviews = getProviderReviews;
window.submitProviderReview = submitProviderReview;
window.getProviderCreditRefunds = getProviderCreditRefunds;
window.canProviderBid = canProviderBid;

// ========== SERVICE EVIDENCE SYSTEM ==========

async function uploadEvidencePhoto(packageId, file) {
  if (!file || !packageId) return { error: "Missing file or packageId" };
  const resizedBlob = await resizeImage(file, 1280, 0.8);
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `${packageId}/${filename}`;
  const { data, error } = await supabaseClient.storage
    .from("evidence")
    .upload(path, resizedBlob, { cacheControl: "3600", upsert: false, contentType: file.type || "image/jpeg" });
  
  if (error) return { url: null, error };
  
  const { data: publicData } = supabaseClient.storage.from("evidence").getPublicUrl(path);
  return { url: publicData.publicUrl, error: null };
}

async function uploadEvidencePhotos(packageId, files) {
  const urls = [];
  for (const file of files) {
    const result = await uploadEvidencePhoto(packageId, file);
    if (result.url) {
      urls.push(result.url);
    }
  }
  return urls;
}

async function saveEvidence(evidenceData) {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };
  
  const { data, error } = await supabaseClient
    .from('service_evidence')
    .insert({
      package_id: evidenceData.packageId,
      type: evidenceData.type,
      photos: evidenceData.photos || [],
      odometer: evidenceData.odometer || null,
      fuel_level: evidenceData.fuelLevel || null,
      notes: evidenceData.notes || null,
      exterior_condition: evidenceData.exteriorCondition || null,
      interior_condition: evidenceData.interiorCondition || null,
      created_by: user.id,
      created_by_role: evidenceData.role || 'provider',
      lat: evidenceData.lat || null,
      lng: evidenceData.lng || null
    })
    .select()
    .single();
  
  if (!error) {
    const { data: pkg } = await supabaseClient
      .from('maintenance_packages')
      .select('member_id, accepted_bid_id, bids!accepted_bid_id(provider_id)')
      .eq('id', evidenceData.packageId)
      .single();
    
    if (pkg) {
      const typeLabels = {
        'pre_pickup': 'Pre-Pickup',
        'arrival_shop': 'Shop Arrival',
        'post_service': 'Post-Service',
        'return': 'Vehicle Return'
      };
      
      const recipientId = evidenceData.role === 'member' ? pkg.bids?.provider_id : pkg.member_id;
      if (recipientId) {
        await createNotification(
          recipientId,
          'evidence_captured',
          `${typeLabels[evidenceData.type] || 'Vehicle'} Evidence Captured 📸`,
          `Vehicle condition has been documented with photos, odometer, and fuel level.`,
          'package',
          evidenceData.packageId
        );
      }
    }
  }
  
  return { data, error };
}

async function getPackageEvidence(packageId) {
  const { data, error } = await supabaseClient
    .from('service_evidence')
    .select('*, profiles:created_by(full_name, business_name)')
    .eq('package_id', packageId)
    .order('created_at', { ascending: true });
  
  return { data: data || [], error };
}

async function deleteEvidence(evidenceId) {
  const { error } = await supabaseClient
    .from('service_evidence')
    .delete()
    .eq('id', evidenceId);
  
  return { error };
}

// Export evidence functions
window.uploadEvidencePhoto = uploadEvidencePhoto;
window.uploadEvidencePhotos = uploadEvidencePhotos;
window.saveEvidence = saveEvidence;
window.getPackageEvidence = getPackageEvidence;
window.deleteEvidence = deleteEvidence;

// ========== LIVE GPS DRIVER TRACKING ==========

async function updateDriverLocation(packageId, lat, lng, heading, speed, trackingType) {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };
  
  const { data, error } = await supabaseClient
    .from('driver_locations')
    .upsert({
      package_id: packageId,
      driver_id: user.id,
      lat: lat,
      lng: lng,
      heading: heading || null,
      speed: speed || null,
      tracking_type: trackingType || 'in_transit',
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'package_id'
    })
    .select()
    .single();
  
  return { data, error };
}

async function getDriverLocation(packageId) {
  const { data, error } = await supabaseClient
    .from('driver_locations')
    .select('*, profiles:driver_id(full_name, business_name, provider_alias)')
    .eq('package_id', packageId)
    .single();
  
  return { data, error };
}

async function clearDriverLocation(packageId) {
  const { error } = await supabaseClient
    .from('driver_locations')
    .delete()
    .eq('package_id', packageId);
  
  return { error };
}

// Export GPS tracking functions
window.updateDriverLocation = updateDriverLocation;
window.getDriverLocation = getDriverLocation;
window.clearDriverLocation = clearDriverLocation;

// ========== EMERGENCY ROADSIDE CONCIERGE ==========

async function createEmergencyRequest(data) {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };
  
  const insertData = {
    member_id: user.id,
    vehicle_id: data.vehicleId || null,
    lat: data.lat,
    lng: data.lng,
    address: data.address || null,
    emergency_type: data.emergencyType,
    description: data.description || null,
    photos: data.photos || [],
    status: 'pending'
  };
  
  if (data.activationFee !== undefined) {
    insertData.activation_fee = data.activationFee;
  }
  if (data.escrowAmount !== undefined) {
    insertData.escrow_amount = data.escrowAmount;
  }
  if (data.estimatedMiles !== undefined && data.estimatedMiles !== null) {
    insertData.estimated_miles = data.estimatedMiles;
  }
  if (data.claimDeadline) {
    insertData.claim_deadline = data.claimDeadline;
  }
  if (data.paymentStatus) {
    insertData.payment_status = data.paymentStatus;
  }
  
  const { data: emergency, error } = await supabaseClient
    .from('emergency_requests')
    .insert(insertData)
    .select()
    .single();
  
  return { data: emergency, error };
}

async function getMyEmergencies(memberId) {
  const { data, error } = await supabaseClient
    .from('emergency_requests')
    .select(`
      *,
      vehicles(year, make, model),
      provider:assigned_provider_id(full_name, business_name, phone)
    `)
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  
  return { data: data || [], error };
}

async function getActiveEmergency(memberId) {
  const { data, error } = await supabaseClient
    .from('emergency_requests')
    .select(`
      *,
      vehicles(year, make, model),
      provider:assigned_provider_id(full_name, business_name, phone)
    `)
    .eq('member_id', memberId)
    .in('status', ['pending', 'accepted', 'en_route', 'arrived', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  return { data, error };
}

async function getNearbyEmergencies(providerLat, providerLng, radiusMiles = 25) {
  const { data, error } = await supabaseClient
    .from('emergency_requests')
    .select(`
      *,
      member:member_id(full_name, phone),
      vehicles(year, make, model)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  
  if (error) return { data: [], error };
  
  const now = new Date();
  const filtered = (data || []).filter(e => {
    // Check claim_deadline - allow jobs with expired deadline if claim_round < 3
    if (e.claim_deadline) {
      const deadline = new Date(e.claim_deadline);
      if (deadline <= now) {
        // Only filter out if all 3 rounds are exhausted
        const currentRound = e.claim_round || 1;
        if (currentRound >= 3) return false;
        // Job is still eligible - will be auto-extended by member's polling
      }
    }
    const distance = calculateDistance(providerLat, providerLng, e.lat, e.lng);
    e.distance_miles = distance;
    return distance <= radiusMiles;
  }).sort((a, b) => a.distance_miles - b.distance_miles);
  
  return { data: filtered, error: null };
}

async function extendEmergencyRound(requestId) {
  // First get the current claim_round
  const { data: current, error: fetchError } = await supabaseClient
    .from('emergency_requests')
    .select('claim_round, status')
    .eq('id', requestId)
    .single();
  
  if (fetchError || !current) {
    return { data: null, error: fetchError || 'Request not found' };
  }
  
  // Only extend if status is still pending and round < 3
  if (current.status !== 'pending') {
    return { data: null, error: 'Request is no longer pending' };
  }
  
  const currentRound = current.claim_round || 1;
  if (currentRound >= 3) {
    return { data: null, error: 'All rounds exhausted', roundsExhausted: true };
  }
  
  const newRound = currentRound + 1;
  const newDeadline = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes from now
  
  const { data, error } = await supabaseClient
    .from('emergency_requests')
    .update({
      claim_round: newRound,
      claim_deadline: newDeadline,
      updated_at: new Date().toISOString()
    })
    .eq('id', requestId)
    .select()
    .single();
  
  return { data, error };
}

async function getMyAcceptedEmergencies(providerId) {
  const { data, error } = await supabaseClient
    .from('emergency_requests')
    .select(`
      *,
      member:member_id(full_name, phone),
      vehicles(year, make, model)
    `)
    .eq('assigned_provider_id', providerId)
    .in('status', ['accepted', 'en_route', 'arrived', 'in_progress'])
    .order('created_at', { ascending: false });
  
  return { data: data || [], error };
}

async function acceptEmergency(emergencyId, providerId, etaMinutes) {
  const { data, error } = await supabaseClient
    .from('emergency_requests')
    .update({
      assigned_provider_id: providerId,
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      eta_minutes: etaMinutes,
      updated_at: new Date().toISOString()
    })
    .eq('id', emergencyId)
    .eq('status', 'pending')
    .select(`
      *,
      member:member_id(full_name, phone)
    `)
    .single();
  
  if (!error && data) {
    await createNotification(
      data.member_id,
      'emergency_accepted',
      'Help is on the way! 🚗',
      `A provider has accepted your emergency request. ETA: ${etaMinutes} minutes.`,
      'emergency',
      emergencyId
    );
  }
  
  return { data, error };
}

async function updateEmergencyStatus(emergencyId, status, extraData = {}) {
  const updatePayload = {
    status: status,
    updated_at: new Date().toISOString(),
    ...extraData
  };
  
  if (status === 'completed') {
    updatePayload.completed_at = new Date().toISOString();
  }
  
  const { data, error } = await supabaseClient
    .from('emergency_requests')
    .update(updatePayload)
    .eq('id', emergencyId)
    .select(`
      *,
      member:member_id(full_name, phone),
      provider:assigned_provider_id(full_name, business_name, phone)
    `)
    .single();
  
  if (!error && data) {
    const statusMessages = {
      'en_route': 'Your provider is now en route to your location!',
      'arrived': 'Your provider has arrived at your location.',
      'in_progress': 'Work is now in progress on your vehicle.',
      'completed': 'Your emergency service has been completed!'
    };
    
    if (statusMessages[status]) {
      await createNotification(
        data.member_id,
        'emergency_status_update',
        status === 'completed' ? 'Emergency Resolved ✅' : 'Emergency Update 🚗',
        statusMessages[status],
        'emergency',
        emergencyId
      );
    }
  }
  
  return { data, error };
}

async function getEmergencyDetails(emergencyId) {
  const { data, error } = await supabaseClient
    .from('emergency_requests')
    .select(`
      *,
      member:member_id(full_name, phone, email),
      provider:assigned_provider_id(full_name, business_name, phone),
      vehicles(year, make, model, color, license_plate)
    `)
    .eq('id', emergencyId)
    .single();
  
  return { data, error };
}

async function respondToEmergency(emergencyId, providerId, etaMinutes, bidCreditsSpent = 1) {
  const { data, error } = await supabaseClient
    .from('emergency_requests')
    .update({
      assigned_provider_id: providerId,
      status: 'accepted',
      eta_minutes: etaMinutes,
      provider_eta_minutes: etaMinutes,
      claimed_at: new Date().toISOString(),
      accepted_at: new Date().toISOString(),
      bid_credits_spent: bidCreditsSpent,
      updated_at: new Date().toISOString()
    })
    .eq('id', emergencyId)
    .eq('status', 'pending')
    .select()
    .single();
  
  if (!error && data) {
    await createNotification(
      data.member_id,
      'emergency_accepted',
      'Help is on the way! 🚗',
      `A provider has accepted your emergency request. ETA: ${etaMinutes} minutes.`,
      'emergency',
      emergencyId
    );
  }
  
  return { data, error };
}

async function cancelEmergency(emergencyId) {
  const { data, error } = await supabaseClient
    .from('emergency_requests')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('id', emergencyId)
    .in('status', ['pending'])
    .select()
    .single();
  
  return { data, error };
}

async function uploadEmergencyPhoto(emergencyId, file) {
  if (!file || !emergencyId) return { error: 'Missing file or emergencyId' };
  const resizedBlob = await resizeImage(file, 1280, 0.8);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `emergencies/${emergencyId}/${filename}`;
  
  const { data, error } = await supabaseClient.storage
    .from('package-photos')
    .upload(path, resizedBlob, { cacheControl: '3600', upsert: false, contentType: file.type || 'image/jpeg' });
  
  if (error) return { error };
  
  const { data: publicData } = supabaseClient.storage.from('package-photos').getPublicUrl(path);
  return { data: publicData.publicUrl, error: null };
}

async function getProviderEmergencySettings(providerId) {
  const { data, error } = await supabaseClient
    .from('provider_applications')
    .select('accepts_emergency_calls, can_tow, is_24_seven, emergency_radius, emergency_services')
    .eq('user_id', providerId)
    .single();
  
  return { data, error };
}

async function updateProviderEmergencySettings(providerId, settings) {
  const { data, error } = await supabaseClient
    .from('provider_applications')
    .update({
      accepts_emergency_calls: settings.acceptsEmergencyCalls,
      can_tow: settings.canTow,
      is_24_seven: settings.is24Seven,
      emergency_radius: settings.emergencyRadius,
      emergency_services: settings.emergencyServices
    })
    .eq('user_id', providerId)
    .select()
    .single();
  
  return { data, error };
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Export emergency functions
window.createEmergencyRequest = createEmergencyRequest;
window.getMyEmergencies = getMyEmergencies;
window.getActiveEmergency = getActiveEmergency;
window.getNearbyEmergencies = getNearbyEmergencies;
window.extendEmergencyRound = extendEmergencyRound;
window.getMyAcceptedEmergencies = getMyAcceptedEmergencies;
window.acceptEmergency = acceptEmergency;
window.respondToEmergency = respondToEmergency;
window.updateEmergencyStatus = updateEmergencyStatus;
window.getEmergencyDetails = getEmergencyDetails;
window.cancelEmergency = cancelEmergency;
window.uploadEmergencyPhoto = uploadEmergencyPhoto;
window.getProviderEmergencySettings = getProviderEmergencySettings;
window.updateProviderEmergencySettings = updateProviderEmergencySettings;
window.calculateDistance = calculateDistance;

// ========================
// PROVIDER PERFORMANCE SCORING
// ========================

async function getProviderPerformance(providerId) {
  const { data, error } = await supabaseClient
    .from('provider_performance')
    .select('*')
    .eq('provider_id', providerId)
    .single();
  
  return { data, error };
}

async function getProviderPerformanceByIds(providerIds) {
  if (!providerIds || providerIds.length === 0) return { data: [], error: null };
  
  const { data, error } = await supabaseClient
    .from('provider_performance')
    .select('*')
    .in('provider_id', providerIds);
  
  return { data: data || [], error };
}

async function calculateProviderPerformance(providerId) {
  try {
    // Fetch reviews for this provider
    const { data: reviews } = await supabaseClient
      .from('reviews')
      .select('rating, quality_rating, communication_rating, timeliness_rating, value_rating, created_at')
      .eq('provider_id', providerId);

    // Fetch bids for this provider
    const { data: bids } = await supabaseClient
      .from('bids')
      .select('id, status, created_at, package_id')
      .eq('provider_id', providerId);

    // Fetch completed packages (where provider's bid was accepted)
    const { data: completedPackages } = await supabaseClient
      .from('maintenance_packages')
      .select('id, status, deadline, completed_at, winning_bid_id')
      .in('winning_bid_id', (bids || []).map(b => b.id))
      .eq('status', 'completed');

    // Calculate metrics
    const ratingCount = reviews?.length || 0;
    const ratingAvg = ratingCount > 0 
      ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / ratingCount 
      : 0;

    const bidsSubmitted = bids?.length || 0;
    const acceptedBids = bids?.filter(b => b.status === 'accepted' || b.status === 'won')?.length || 0;
    const acceptanceRate = bidsSubmitted > 0 ? (acceptedBids / bidsSubmitted) * 100 : 0;

    const jobsCompleted = completedPackages?.length || 0;
    const jobsOnTime = completedPackages?.filter(p => {
      if (!p.deadline || !p.completed_at) return true;
      return new Date(p.completed_at) <= new Date(p.deadline);
    })?.length || 0;
    const onTimeRate = jobsCompleted > 0 ? (jobsOnTime / jobsCompleted) * 100 : 100;

    // Calculate average response time (hours between package creation and first bid)
    let avgResponseTimeHours = null;
    if (bids && bids.length > 0) {
      const responseTimes = [];
      for (const bid of bids) {
        const { data: pkg } = await supabaseClient
          .from('maintenance_packages')
          .select('created_at')
          .eq('id', bid.package_id)
          .single();
        
        if (pkg) {
          const bidTime = new Date(bid.created_at);
          const pkgTime = new Date(pkg.created_at);
          const hours = (bidTime - pkgTime) / (1000 * 60 * 60);
          if (hours >= 0 && hours < 720) { // Cap at 30 days
            responseTimes.push(hours);
          }
        }
      }
      if (responseTimes.length > 0) {
        avgResponseTimeHours = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      }
    }

    // Calculate overall score (weighted average)
    const ratingScore = (ratingAvg / 5) * 100;
    const reliabilityScore = onTimeRate;
    const experienceScore = Math.min(jobsCompleted / 100, 1) * 100;
    const responsivenessScore = avgResponseTimeHours !== null 
      ? Math.max(0, 100 - (avgResponseTimeHours * 5)) 
      : 50; // Default to 50 if no data

    const overallScore = (
      ratingScore * 0.4 +
      reliabilityScore * 0.3 +
      experienceScore * 0.15 +
      responsivenessScore * 0.15
    );

    // Determine tier
    let tier = 'bronze';
    if (overallScore >= 90) tier = 'platinum';
    else if (overallScore >= 75) tier = 'gold';
    else if (overallScore >= 50) tier = 'silver';

    // Determine badges
    const badges = [];
    if (ratingAvg >= 4.8 && ratingCount >= 3) badges.push('top_rated');
    if (avgResponseTimeHours !== null && avgResponseTimeHours < 2) badges.push('quick_responder');
    if (jobsCompleted >= 50) badges.push('veteran');
    if (overallScore >= 100) badges.push('perfect_score');
    
    // Check for disputes (would need disputes table - assume 0 for now)
    const disputesCount = 0;
    if (disputesCount === 0 && jobsCompleted >= 5) badges.push('dispute_free');

    // Upsert performance record
    const performanceData = {
      provider_id: providerId,
      overall_score: Math.round(overallScore * 10) / 10,
      rating_avg: Math.round(ratingAvg * 100) / 100,
      rating_count: ratingCount,
      jobs_completed: jobsCompleted,
      jobs_on_time: jobsOnTime,
      on_time_rate: Math.round(onTimeRate * 100) / 100,
      avg_response_time_hours: avgResponseTimeHours ? Math.round(avgResponseTimeHours * 100) / 100 : null,
      disputes_count: disputesCount,
      disputes_resolved: 0,
      bids_submitted: bidsSubmitted,
      bids_accepted: acceptedBids,
      acceptance_rate: Math.round(acceptanceRate * 100) / 100,
      badges: badges,
      tier: tier,
      last_calculated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseClient
      .from('provider_performance')
      .upsert(performanceData, { onConflict: 'provider_id' })
      .select()
      .single();

    return { data: data || performanceData, error };
  } catch (err) {
    console.error('Error calculating provider performance:', err);
    return { data: null, error: err };
  }
}

function getTierIcon(tier) {
  const icons = {
    platinum: '💎',
    gold: '🥇',
    silver: '🥈',
    bronze: '🥉'
  };
  return icons[tier] || '🥉';
}

function getTierLabel(tier) {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Bronze';
}

function formatResponseTime(hours) {
  if (hours === null || hours === undefined) return '--';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function generateStarsHtml(rating, maxStars = 5) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  const emptyStars = maxStars - fullStars - (hasHalf ? 1 : 0);
  
  let html = '';
  for (let i = 0; i < fullStars; i++) html += '★';
  if (hasHalf) html += '½';
  for (let i = 0; i < emptyStars; i++) html += '☆';
  return html;
}

function getPerformanceTips(performance) {
  const tips = [];
  
  if (!performance) {
    tips.push({
      icon: '🚀',
      text: 'Start bidding on packages to build your performance profile and unlock badges!'
    });
    return tips;
  }

  // Rating tips
  if (performance.rating_count < 3) {
    tips.push({
      icon: '⭐',
      text: 'Complete more jobs to collect reviews. You need at least 3 reviews for the Top Rated badge.'
    });
  } else if (performance.rating_avg < 4.8) {
    tips.push({
      icon: '⭐',
      text: `Your rating is ${performance.rating_avg.toFixed(1)}/5. Aim for 4.8+ to earn the Top Rated badge!`
    });
  }

  // Response time tips
  if (performance.avg_response_time_hours === null) {
    tips.push({
      icon: '⚡',
      text: 'Respond to packages quickly! Providers who respond within 2 hours earn the Quick Responder badge.'
    });
  } else if (performance.avg_response_time_hours >= 2) {
    tips.push({
      icon: '⚡',
      text: `Your average response time is ${formatResponseTime(performance.avg_response_time_hours)}. Respond within 2 hours to earn the Quick Responder badge!`
    });
  }

  // Experience tips
  if (performance.jobs_completed < 50) {
    tips.push({
      icon: '🎖️',
      text: `You've completed ${performance.jobs_completed} jobs. Complete 50 to earn the Veteran badge!`
    });
  }

  // On-time tips
  if (performance.on_time_rate < 90 && performance.jobs_completed > 0) {
    tips.push({
      icon: '⏱️',
      text: `Your on-time rate is ${performance.on_time_rate.toFixed(0)}%. Meeting deadlines improves your reliability score by 30%!`
    });
  }

  // Acceptance rate tips
  if (performance.acceptance_rate < 20 && performance.bids_submitted >= 10) {
    tips.push({
      icon: '🎯',
      text: 'Your bid acceptance rate is low. Try making more competitive bids with detailed descriptions.'
    });
  }

  // Overall score tips
  if (performance.overall_score < 50) {
    tips.push({
      icon: '📈',
      text: 'Focus on improving your ratings and response time to reach Silver tier (50+ score).'
    });
  } else if (performance.overall_score < 75) {
    tips.push({
      icon: '📈',
      text: 'You\'re close to Gold tier! Keep up the good work and aim for 75+ overall score.'
    });
  } else if (performance.overall_score < 90) {
    tips.push({
      icon: '💎',
      text: 'Excellent work! You\'re near Platinum tier. Achieve 90+ score to become a top provider!'
    });
  }

  if (tips.length === 0) {
    tips.push({
      icon: '🏆',
      text: 'Outstanding performance! You\'re among our top-rated providers. Keep up the excellent work!'
    });
  }

  return tips;
}

// Export performance functions
window.getProviderPerformance = getProviderPerformance;
window.getProviderPerformanceByIds = getProviderPerformanceByIds;
window.calculateProviderPerformance = calculateProviderPerformance;
window.getTierIcon = getTierIcon;
window.getTierLabel = getTierLabel;
window.formatResponseTime = formatResponseTime;
window.generateStarsHtml = generateStarsHtml;
window.getPerformanceTips = getPerformanceTips;

// =====================================================
// SPENDING LIMIT & APPROVAL WORKFLOW
// =====================================================

// Helper function to check if a user has spending limits or requires approval
// Checks if user is in a household or fleet with spending limits
// Returns: { allowed: true/false, limit: number, requiresApproval: boolean, message: string, memberRecord: object, context: 'fleet'|'household' }
async function checkSpendingLimit(userId, amount, context = null) {
  const result = {
    allowed: true,
    limit: null,
    requiresApproval: false,
    message: null,
    memberRecord: null,
    context: null
  };
  
  if (!userId) {
    return result;
  }
  
  const amountNum = parseFloat(amount) || 0;
  
  if (context === 'fleet' || context === null) {
    const { data: fleetMember } = await supabaseClient
      .from('fleet_members')
      .select('id, fleet_id, role, spending_limit, requires_approval, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (fleetMember) {
      result.context = 'fleet';
      result.memberRecord = fleetMember;
      
      if (fleetMember.spending_limit !== null && fleetMember.spending_limit !== undefined) {
        result.limit = parseFloat(fleetMember.spending_limit);
        if (amountNum > result.limit) {
          result.allowed = false;
          result.message = `Exceeds spending limit of $${result.limit.toFixed(2)}`;
          return result;
        }
      }
      
      if (fleetMember.requires_approval === true) {
        result.requiresApproval = true;
      }
      
      return result;
    }
  }
  
  if (context === 'household' || context === null) {
    const { data: householdMember } = await supabaseClient
      .from('household_members')
      .select('id, household_id, role, spending_limit, requires_approval, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (householdMember) {
      result.context = 'household';
      result.memberRecord = householdMember;
      
      if (householdMember.spending_limit !== null && householdMember.spending_limit !== undefined) {
        result.limit = parseFloat(householdMember.spending_limit);
        if (amountNum > result.limit) {
          result.allowed = false;
          result.message = `Exceeds spending limit of $${result.limit.toFixed(2)}`;
          return result;
        }
      }
      
      if (householdMember.requires_approval === true) {
        result.requiresApproval = true;
      }
      
      return result;
    }
  }
  
  return result;
}

window.checkSpendingLimit = checkSpendingLimit;

// =====================================================
// DESTINATION SERVICES
// =====================================================

// Create a new destination service linked to a package
// Supports various service types: airport_pickup, airport_dropoff, parking, dealership, detailing, valet
async function createDestinationService(data) {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };
  
  // SPENDING LIMIT CHECK: Before creating the service, check if the user is part of a household or fleet.
  // If so, verify their spending limit and requires_approval status.
  // If estimated cost exceeds spending_limit, return error.
  // If requires_approval is true, set approval_status to 'pending_approval'.
  const estimatedCost = parseFloat(data.estimated_cost) || 0;
  const spendingCheck = await checkSpendingLimit(user.id, estimatedCost, data.context || null);
  
  if (!spendingCheck.allowed) {
    return { data: null, error: spendingCheck.message || 'Service cost exceeds your spending limit' };
  }
  
  const initialStatus = spendingCheck.requiresApproval ? 'pending_approval' : 'pending';
  
  const { data: service, error } = await supabaseClient
    .from('destination_services')
    .insert({
      package_id: data.package_id,
      service_type: data.service_type,
      pickup_location: data.pickup_location || null,
      dropoff_location: data.dropoff_location || null,
      flight_number: data.flight_number || null,
      airline: data.airline || null,
      flight_datetime: data.flight_datetime || null,
      trip_type: data.trip_type || null,
      parking_location: data.parking_location || null,
      parking_spot: data.parking_spot || null,
      dealership_name: data.dealership_name || null,
      dealership_service_type: data.dealership_service_type || null,
      detail_service_level: data.detail_service_level || null,
      valet_event_name: data.valet_event_name || null,
      valet_venue: data.valet_venue || null,
      special_instructions: data.special_instructions || null,
      estimated_pickup_time: data.estimated_pickup_time || null,
      estimated_cost: estimatedCost || null,
      status: initialStatus,
      approval_status: spendingCheck.requiresApproval ? 'pending_approval' : null,
      requested_by: user.id
    })
    .select()
    .single();
  
  if (!error && spendingCheck.requiresApproval && spendingCheck.memberRecord) {
    if (spendingCheck.context === 'fleet') {
      const { data: fleet } = await supabaseClient
        .from('fleets')
        .select('owner_id, name')
        .eq('id', spendingCheck.memberRecord.fleet_id)
        .single();
      
      if (fleet?.owner_id) {
        await createNotification(
          fleet.owner_id,
          'service_pending_approval',
          'Service Requires Approval',
          `A destination service request requires your approval for fleet "${fleet.name}".`,
          'destination_service',
          service.id
        );
      }
      
      const { data: managers } = await supabaseClient
        .from('fleet_members')
        .select('user_id')
        .eq('fleet_id', spendingCheck.memberRecord.fleet_id)
        .eq('role', 'manager')
        .eq('status', 'active');
      
      if (managers) {
        for (const manager of managers) {
          if (manager.user_id !== fleet?.owner_id) {
            await createNotification(
              manager.user_id,
              'service_pending_approval',
              'Service Requires Approval',
              `A destination service request requires your approval for fleet "${fleet?.name}".`,
              'destination_service',
              service.id
            );
          }
        }
      }
    } else if (spendingCheck.context === 'household') {
      const { data: household } = await supabaseClient
        .from('households')
        .select('owner_id, name')
        .eq('id', spendingCheck.memberRecord.household_id)
        .single();
      
      if (household?.owner_id) {
        await createNotification(
          household.owner_id,
          'service_pending_approval',
          'Service Requires Approval',
          `A destination service request requires your approval for household "${household.name}".`,
          'destination_service',
          service.id
        );
      }
    }
  }
  
  return { data: service, error, requiresApproval: spendingCheck.requiresApproval };
}

// Get destination service details by package ID
async function getDestinationService(packageId) {
  const { data, error } = await supabaseClient
    .from('destination_services')
    .select('*')
    .eq('package_id', packageId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  return { data, error };
}

// Update destination service status with optional additional data
async function updateDestinationServiceStatus(serviceId, status, extraData = {}) {
  const updatePayload = {
    status: status,
    updated_at: new Date().toISOString(),
    ...extraData
  };
  
  if (status === 'completed') {
    updatePayload.completed_at = new Date().toISOString();
  }
  
  const { data, error } = await supabaseClient
    .from('destination_services')
    .update(updatePayload)
    .eq('id', serviceId)
    .select()
    .single();
  
  return { data, error };
}

// Get all destination services for a member
async function getMyDestinationServices(memberId) {
  const { data, error } = await supabaseClient
    .from('destination_services')
    .select(`
      *,
      maintenance_packages!inner(
        id,
        title,
        status,
        member_id,
        vehicles(year, make, model)
      )
    `)
    .eq('maintenance_packages.member_id', memberId)
    .order('created_at', { ascending: false });
  
  return { data: data || [], error };
}

// Get destination services for packages where provider has accepted bid
async function getProviderDestinationServices(providerId) {
  const { data, error } = await supabaseClient
    .from('destination_services')
    .select(`
      *,
      maintenance_packages!inner(
        id,
        title,
        status,
        member_id,
        vehicles(year, make, model),
        accepted_bid_id,
        bids!accepted_bid_id(provider_id)
      )
    `)
    .eq('maintenance_packages.bids.provider_id', providerId)
    .order('created_at', { ascending: false });
  
  return { data: data || [], error };
}

// Export destination service functions
window.createDestinationService = createDestinationService;
window.getDestinationService = getDestinationService;
window.updateDestinationServiceStatus = updateDestinationServiceStatus;
window.getMyDestinationServices = getMyDestinationServices;
window.getProviderDestinationServices = getProviderDestinationServices;

// =====================================================
// TRANSPORT TASKS
// =====================================================

// Create a transport task for a destination service
// Task types: pickup, dropoff, transfer, parking_retrieval, etc.
async function createTransportTask(data) {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };
  
  const { data: task, error } = await supabaseClient
    .from('transport_tasks')
    .insert({
      destination_service_id: data.destination_service_id,
      driver_id: data.driver_id || null,
      task_type: data.task_type,
      scheduled_time: data.scheduled_time || null,
      notes: data.notes || null,
      status: 'pending'
    })
    .select()
    .single();
  
  return { data: task, error };
}

// Get all transport tasks for a destination service
async function getTransportTasks(destinationServiceId) {
  const { data, error } = await supabaseClient
    .from('transport_tasks')
    .select(`
      *,
      driver:driver_id(full_name, phone, business_name)
    `)
    .eq('destination_service_id', destinationServiceId)
    .order('scheduled_time', { ascending: true });
  
  return { data: data || [], error };
}

// Update transport task with new data (status, start time, photos, etc.)
async function updateTransportTask(taskId, data) {
  const updatePayload = {
    ...data,
    updated_at: new Date().toISOString()
  };
  
  if (data.status === 'in_progress' && !updatePayload.started_at) {
    updatePayload.started_at = new Date().toISOString();
  }
  
  if (data.status === 'completed' && !updatePayload.completed_at) {
    updatePayload.completed_at = new Date().toISOString();
  }
  
  const { data: task, error } = await supabaseClient
    .from('transport_tasks')
    .update(updatePayload)
    .eq('id', taskId)
    .select()
    .single();
  
  return { data: task, error };
}

// Get all tasks assigned to a specific driver
async function getDriverTasks(driverId) {
  const { data, error } = await supabaseClient
    .from('transport_tasks')
    .select(`
      *,
      destination_services!inner(
        *,
        maintenance_packages(
          id,
          title,
          member_id,
          vehicles(year, make, model, color, license_plate),
          profiles:member_id(full_name, phone)
        )
      )
    `)
    .eq('driver_id', driverId)
    .in('status', ['pending', 'in_progress'])
    .order('scheduled_time', { ascending: true });
  
  return { data: data || [], error };
}

// Complete a transport task with photo evidence and notes
async function completeTransportTask(taskId, photoUrl, notes) {
  const { data, error } = await supabaseClient
    .from('transport_tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completion_photo_url: photoUrl || null,
      completion_notes: notes || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId)
    .select()
    .single();
  
  if (!error && data) {
    const { data: task } = await supabaseClient
      .from('transport_tasks')
      .select(`
        destination_service_id,
        destination_services(
          package_id,
          maintenance_packages(member_id, title)
        )
      `)
      .eq('id', taskId)
      .single();
    
    if (task?.destination_services?.maintenance_packages) {
      await createNotification(
        task.destination_services.maintenance_packages.member_id,
        'transport_task_completed',
        'Transport Task Completed ✅',
        `A transport task for "${task.destination_services.maintenance_packages.title}" has been completed.`,
        'package',
        task.destination_services.package_id
      );
    }
  }
  
  return { data, error };
}

// Export transport task functions
window.createTransportTask = createTransportTask;
window.getTransportTasks = getTransportTasks;
window.updateTransportTask = updateTransportTask;
window.getDriverTasks = getDriverTasks;
window.completeTransportTask = completeTransportTask;

// =====================================================
// HOUSEHOLD SHARING MANAGEMENT
// =====================================================

// Create a new household with the specified owner
async function createHousehold(name, ownerId) {
  const { data, error } = await supabaseClient
    .from('households')
    .insert({
      name: name,
      owner_id: ownerId,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  
  return { data, error };
}

// Get all households a user owns or is a member of
async function getMyHouseholds(userId) {
  const { data: owned, error: ownedError } = await supabaseClient
    .from('households')
    .select(`
      *,
      owner:owner_id(full_name, email)
    `)
    .eq('owner_id', userId);
  
  const { data: memberOf, error: memberError } = await supabaseClient
    .from('household_members')
    .select(`
      *,
      household:household_id(
        *,
        owner:owner_id(full_name, email)
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'active');
  
  if (ownedError || memberError) {
    return { data: { owned: [], memberOf: [] }, error: ownedError || memberError };
  }
  
  return { 
    data: { 
      owned: owned || [], 
      memberOf: (memberOf || []).map(m => ({ ...m.household, membership: m })) 
    }, 
    error: null 
  };
}

// Get detailed household information including all members
async function getHouseholdDetails(householdId) {
  const { data: household, error: householdError } = await supabaseClient
    .from('households')
    .select(`
      *,
      owner:owner_id(id, full_name, email, phone)
    `)
    .eq('id', householdId)
    .single();
  
  if (householdError) return { data: null, error: householdError };
  
  const { data: members, error: membersError } = await supabaseClient
    .from('household_members')
    .select(`
      *,
      user:user_id(id, full_name, email, phone)
    `)
    .eq('household_id', householdId)
    .order('created_at', { ascending: true });
  
  return { 
    data: { 
      ...household, 
      members: members || [] 
    }, 
    error: membersError 
  };
}

// Invite a new member to the household by email
async function inviteHouseholdMember(householdId, email, role, invitedBy) {
  const { data: existingUser } = await supabaseClient
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();
  
  const { data, error } = await supabaseClient
    .from('household_members')
    .insert({
      household_id: householdId,
      user_id: existingUser?.id || null,
      email: email,
      role: role || 'member',
      invited_by: invitedBy,
      status: 'pending',
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (!error && existingUser?.id) {
    await createNotification(
      existingUser.id,
      'household_invitation',
      'Household Invitation',
      `You've been invited to join a household. Check your invitations to accept.`,
      'household',
      householdId
    );
  }
  
  return { data, error };
}

// Accept a pending household invitation
async function acceptHouseholdInvitation(membershipId) {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };
  
  const { data, error } = await supabaseClient
    .from('household_members')
    .update({
      user_id: user.id,
      status: 'active',
      accepted_at: new Date().toISOString()
    })
    .eq('id', membershipId)
    .select(`
      *,
      household:household_id(name, owner_id)
    `)
    .single();
  
  if (!error && data?.household?.owner_id) {
    await createNotification(
      data.household.owner_id,
      'household_member_joined',
      'New Household Member',
      `A new member has joined your household "${data.household.name}".`,
      'household',
      data.household_id
    );
  }
  
  return { data, error };
}

// Update permissions for a household member
async function updateHouseholdMemberPermissions(membershipId, permissions) {
  const { data, error } = await supabaseClient
    .from('household_members')
    .update({
      permissions: permissions,
      updated_at: new Date().toISOString()
    })
    .eq('id', membershipId)
    .select()
    .single();
  
  return { data, error };
}

// Remove a member from the household
async function removeHouseholdMember(membershipId) {
  const { error } = await supabaseClient
    .from('household_members')
    .delete()
    .eq('id', membershipId);
  
  return { error };
}

// Share a vehicle with a household
async function shareVehicleWithHousehold(householdId, vehicleId, accessLevel, sharedBy) {
  const { data, error } = await supabaseClient
    .from('household_vehicles')
    .insert({
      household_id: householdId,
      vehicle_id: vehicleId,
      access_level: accessLevel || 'view',
      shared_by: sharedBy,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  
  return { data, error };
}

// Get all vehicles shared with a household
async function getHouseholdVehicles(householdId) {
  const { data, error } = await supabaseClient
    .from('household_vehicles')
    .select(`
      *,
      vehicle:vehicle_id(
        id, year, make, model, color, license_plate, vin,
        owner:member_id(full_name, email)
      ),
      shared_by_user:shared_by(full_name)
    `)
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });
  
  return { data: data || [], error };
}

// Update vehicle access level in a household
async function updateVehicleAccess(accessId, newLevel) {
  const { data, error } = await supabaseClient
    .from('household_vehicles')
    .update({
      access_level: newLevel,
      updated_at: new Date().toISOString()
    })
    .eq('id', accessId)
    .select()
    .single();
  
  return { data, error };
}

// Remove a vehicle from household sharing
async function removeVehicleFromHousehold(accessId) {
  const { error } = await supabaseClient
    .from('household_vehicles')
    .delete()
    .eq('id', accessId);
  
  return { error };
}

// Export household management functions
window.createHousehold = createHousehold;
window.getMyHouseholds = getMyHouseholds;
window.getHouseholdDetails = getHouseholdDetails;
window.inviteHouseholdMember = inviteHouseholdMember;
window.acceptHouseholdInvitation = acceptHouseholdInvitation;
window.updateHouseholdMemberPermissions = updateHouseholdMemberPermissions;
window.removeHouseholdMember = removeHouseholdMember;
window.shareVehicleWithHousehold = shareVehicleWithHousehold;
window.getHouseholdVehicles = getHouseholdVehicles;
window.updateVehicleAccess = updateVehicleAccess;
window.removeVehicleFromHousehold = removeVehicleFromHousehold;

// =====================================================
// FLEET MANAGEMENT
// =====================================================

// Create a new fleet with business details
async function createFleet(data) {
  const { data: fleet, error } = await supabaseClient
    .from('fleets')
    .insert({
      name: data.name,
      owner_id: data.owner_id,
      company_name: data.company_name || null,
      business_type: data.business_type || null,
      billing_email: data.billing_email || null,
      billing_address: data.billing_address || null,
      tax_id: data.tax_id || null,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  
  return { data: fleet, error };
}

// Get all fleets a user owns or is a member of
async function getMyFleets(userId) {
  const { data: owned, error: ownedError } = await supabaseClient
    .from('fleets')
    .select(`
      *,
      owner:owner_id(full_name, email)
    `)
    .eq('owner_id', userId);
  
  const { data: memberOf, error: memberError } = await supabaseClient
    .from('fleet_members')
    .select(`
      *,
      fleet:fleet_id(
        *,
        owner:owner_id(full_name, email)
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'active');
  
  if (ownedError || memberError) {
    return { data: { owned: [], memberOf: [] }, error: ownedError || memberError };
  }
  
  return { 
    data: { 
      owned: owned || [], 
      memberOf: (memberOf || []).map(m => ({ ...m.fleet, membership: m })) 
    }, 
    error: null 
  };
}

// Get detailed fleet information including members and vehicles
async function getFleetDetails(fleetId) {
  const { data: fleet, error: fleetError } = await supabaseClient
    .from('fleets')
    .select(`
      *,
      owner:owner_id(id, full_name, email, phone)
    `)
    .eq('id', fleetId)
    .single();
  
  if (fleetError) return { data: null, error: fleetError };
  
  const { data: members } = await supabaseClient
    .from('fleet_members')
    .select(`
      *,
      user:user_id(id, full_name, email, phone)
    `)
    .eq('fleet_id', fleetId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  
  const { data: vehicles } = await supabaseClient
    .from('fleet_vehicles')
    .select(`
      *,
      vehicle:vehicle_id(id, year, make, model, color, license_plate, vin)
    `)
    .eq('fleet_id', fleetId)
    .order('created_at', { ascending: false });
  
  return { 
    data: { 
      ...fleet, 
      members: members || [],
      vehicles: vehicles || []
    }, 
    error: null 
  };
}

// Add a member to the fleet
async function addFleetMember(fleetId, userId, role, data = {}) {
  const { data: member, error } = await supabaseClient
    .from('fleet_members')
    .insert({
      fleet_id: fleetId,
      user_id: userId,
      role: role || 'driver',
      department: data.department || null,
      employee_id: data.employee_id || null,
      permissions: data.permissions || null,
      status: 'active',
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (!error) {
    await createNotification(
      userId,
      'fleet_member_added',
      'Added to Fleet',
      `You've been added to a fleet as a ${role || 'driver'}.`,
      'fleet',
      fleetId
    );
  }
  
  return { data: member, error };
}

// Update fleet member details
async function updateFleetMember(memberId, data) {
  const { data: member, error } = await supabaseClient
    .from('fleet_members')
    .update({
      ...data,
      updated_at: new Date().toISOString()
    })
    .eq('id', memberId)
    .select()
    .single();
  
  return { data: member, error };
}

// Remove a member from the fleet
async function removeFleetMember(memberId) {
  const { error } = await supabaseClient
    .from('fleet_members')
    .update({
      status: 'inactive',
      updated_at: new Date().toISOString()
    })
    .eq('id', memberId);
  
  return { error };
}

// Assign a vehicle to the fleet
async function assignVehicleToFleet(fleetId, vehicleId, assignmentData = {}) {
  const { data, error } = await supabaseClient
    .from('fleet_vehicles')
    .insert({
      fleet_id: fleetId,
      vehicle_id: vehicleId,
      assigned_driver_id: assignmentData.assigned_driver_id || null,
      department: assignmentData.department || null,
      cost_center: assignmentData.cost_center || null,
      notes: assignmentData.notes || null,
      status: 'active',
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  
  return { data, error };
}

// Update fleet vehicle assignment
async function updateFleetVehicleAssignment(assignmentId, data) {
  const { data: assignment, error } = await supabaseClient
    .from('fleet_vehicles')
    .update({
      ...data,
      updated_at: new Date().toISOString()
    })
    .eq('id', assignmentId)
    .select()
    .single();
  
  return { data: assignment, error };
}

// Get all vehicles assigned to a fleet
async function getFleetVehicles(fleetId) {
  const { data, error } = await supabaseClient
    .from('fleet_vehicles')
    .select(`
      *,
      vehicle:vehicle_id(
        id, year, make, model, color, license_plate, vin
      ),
      assigned_driver:assigned_driver_id(full_name, email, phone)
    `)
    .eq('fleet_id', fleetId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  
  return { data: data || [], error };
}

// Export fleet management functions
window.createFleet = createFleet;
window.getMyFleets = getMyFleets;
window.getFleetDetails = getFleetDetails;
window.addFleetMember = addFleetMember;
window.updateFleetMember = updateFleetMember;
window.removeFleetMember = removeFleetMember;
window.assignVehicleToFleet = assignVehicleToFleet;
window.updateFleetVehicleAssignment = updateFleetVehicleAssignment;
window.getFleetVehicles = getFleetVehicles;

// =====================================================
// BULK SERVICE SCHEDULING
// =====================================================

// Create a bulk service batch for a fleet
// SPENDING LIMIT ENFORCEMENT: Checks if the creator's fleet role has requires_approval flag.
// If true, sets status to 'pending_approval' instead of 'draft'.
// Also compares total_estimated_cost with creator's spending_limit.
async function createBulkServiceBatch(fleetId, data) {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };
  
  const { data: fleet } = await supabaseClient
    .from('fleets')
    .select('owner_id')
    .eq('id', fleetId)
    .single();
  
  const isOwner = fleet?.owner_id === user.id;
  
  let userRole = null;
  let userMembership = null;
  if (!isOwner) {
    // Fetch the user's fleet membership to check role, spending_limit, and requires_approval
    const { data: membership } = await supabaseClient
      .from('fleet_members')
      .select('id, role, spending_limit, requires_approval')
      .eq('fleet_id', fleetId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();
    
    if (!membership) {
      return { data: null, error: 'You are not a member of this fleet' };
    }
    
    userRole = membership.role;
    userMembership = membership;
    
    if (userRole !== 'manager' && userRole !== 'owner') {
      return { data: null, error: 'Only managers or owners can create bulk service batches' };
    }
  }
  
  // SPENDING LIMIT CHECK: Compare total_estimated_cost with creator's spending_limit
  const totalEstimatedCost = parseFloat(data.total_estimated_cost) || 0;
  
  if (!isOwner && userMembership) {
    if (userMembership.spending_limit !== null && userMembership.spending_limit !== undefined) {
      const limit = parseFloat(userMembership.spending_limit);
      if (totalEstimatedCost > limit) {
        return { data: null, error: `Service cost exceeds your spending limit of $${limit.toFixed(2)}` };
      }
    }
  }
  
  // If requires_approval is true for this member, set status to 'pending_approval' instead of 'draft'
  const requiresApproval = !isOwner && userMembership?.requires_approval === true;
  const initialStatus = requiresApproval ? 'pending_approval' : 'draft';
  
  const { data: batch, error } = await supabaseClient
    .from('bulk_service_batches')
    .insert({
      fleet_id: fleetId,
      name: data.name,
      service_type: data.service_type,
      description: data.description || null,
      scheduled_start_date: data.scheduled_start_date || null,
      scheduled_end_date: data.scheduled_end_date || null,
      total_estimated_cost: totalEstimatedCost || null,
      created_by: user.id,
      status: initialStatus,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (!error && requiresApproval && batch) {
    if (fleet?.owner_id) {
      await createNotification(
        fleet.owner_id,
        'bulk_batch_pending_approval',
        'Bulk Service Batch Pending Approval',
        `A bulk service batch "${batch.name}" requires your approval.`,
        'fleet',
        fleetId
      );
    }
    
    const { data: managers } = await supabaseClient
      .from('fleet_members')
      .select('user_id')
      .eq('fleet_id', fleetId)
      .eq('role', 'manager')
      .eq('status', 'active')
      .neq('user_id', user.id);
    
    if (managers) {
      for (const manager of managers) {
        if (manager.user_id !== fleet?.owner_id) {
          await createNotification(
            manager.user_id,
            'bulk_batch_pending_approval',
            'Bulk Service Batch Pending Approval',
            `A bulk service batch "${batch.name}" requires approval.`,
            'fleet',
            fleetId
          );
        }
      }
    }
  }
  
  return { data: batch, error, requiresApproval };
}

// Get all bulk service batches for a fleet
async function getFleetBulkBatches(fleetId) {
  const { data, error } = await supabaseClient
    .from('bulk_service_batches')
    .select(`
      *,
      created_by_user:created_by(full_name),
      approved_by_user:approved_by(full_name)
    `)
    .eq('fleet_id', fleetId)
    .order('created_at', { ascending: false });
  
  return { data: data || [], error };
}

// Get detailed batch information including all items
async function getBulkBatchDetails(batchId) {
  const { data: batch, error: batchError } = await supabaseClient
    .from('bulk_service_batches')
    .select(`
      *,
      fleet:fleet_id(id, name, company_name),
      created_by_user:created_by(full_name, email),
      approved_by_user:approved_by(full_name, email)
    `)
    .eq('id', batchId)
    .single();
  
  if (batchError) return { data: null, error: batchError };
  
  const { data: items } = await supabaseClient
    .from('bulk_service_items')
    .select(`
      *,
      vehicle:vehicle_id(id, year, make, model, license_plate),
      package:package_id(id, title, status)
    `)
    .eq('batch_id', batchId)
    .order('scheduled_date', { ascending: true });
  
  return { 
    data: { 
      ...batch, 
      items: items || [] 
    }, 
    error: null 
  };
}

// Add vehicles to a bulk service batch
async function addVehiclesToBulkBatch(batchId, vehicleIds, scheduledDate) {
  const items = vehicleIds.map(vehicleId => ({
    batch_id: batchId,
    vehicle_id: vehicleId,
    scheduled_date: scheduledDate || null,
    status: 'pending',
    created_at: new Date().toISOString()
  }));
  
  const { data, error } = await supabaseClient
    .from('bulk_service_items')
    .insert(items)
    .select();
  
  return { data: data || [], error };
}

// Submit a batch for approval
async function submitBatchForApproval(batchId) {
  const { data, error } = await supabaseClient
    .from('bulk_service_batches')
    .update({
      status: 'pending_approval',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', batchId)
    .select(`
      *,
      fleet:fleet_id(id, owner_id, name)
    `)
    .single();
  
  if (!error && data?.fleet) {
    if (data.fleet.owner_id) {
      await createNotification(
        data.fleet.owner_id,
        'bulk_batch_pending_approval',
        'Bulk Service Batch Pending Approval',
        `A bulk service batch "${data.name}" for fleet "${data.fleet.name}" is waiting for your approval.`,
        'fleet',
        data.fleet_id
      );
    }
    
    const { data: managers } = await supabaseClient
      .from('fleet_members')
      .select('user_id')
      .eq('fleet_id', data.fleet.id)
      .eq('role', 'manager')
      .eq('status', 'active');
    
    if (managers) {
      for (const manager of managers) {
        if (manager.user_id !== data.fleet.owner_id && manager.user_id !== data.created_by) {
          await createNotification(
            manager.user_id,
            'bulk_batch_pending_approval',
            'Bulk Service Batch Pending Approval',
            `A bulk service batch "${data.name}" for fleet "${data.fleet.name}" is waiting for approval.`,
            'fleet',
            data.fleet_id
          );
        }
      }
    }
  }
  
  return { data, error };
}

// Creates a maintenance_package for a bulk service item
// Links the item to the created package
// Returns the created package
async function createPackageFromBulkItem(batchId, itemId) {
  // 1. Get the bulk batch details
  const { data: batch, error: batchError } = await supabaseClient
    .from('bulk_service_batches')
    .select(`
      *,
      fleet:fleet_id(id, owner_id, name)
    `)
    .eq('id', batchId)
    .single();
  
  if (batchError || !batch) {
    return { data: null, error: batchError || 'Batch not found' };
  }
  
  // 2. Get the bulk item details
  const { data: item, error: itemError } = await supabaseClient
    .from('bulk_service_items')
    .select(`
      *,
      vehicle:vehicle_id(id, year, make, model, license_plate, owner_id)
    `)
    .eq('id', itemId)
    .single();
  
  if (itemError || !item) {
    return { data: null, error: itemError || 'Item not found' };
  }
  
  // Skip if package already exists
  if (item.package_id) {
    const { data: existingPackage } = await supabaseClient
      .from('maintenance_packages')
      .select('*')
      .eq('id', item.package_id)
      .single();
    return { data: existingPackage, error: null, skipped: true };
  }
  
  // 3. Determine the member_id (fleet owner is responsible for bulk service packages)
  const memberId = batch.fleet?.owner_id;
  
  if (!memberId) {
    return { data: null, error: 'Fleet owner not found' };
  }
  
  // 4. Create the maintenance_package with bulk service flags
  const vehicleName = item.vehicle 
    ? `${item.vehicle.year} ${item.vehicle.make} ${item.vehicle.model}` 
    : 'Vehicle';
  
  const packageTitle = batch.title || batch.name || 'Bulk Service';
  const packageDescription = batch.service_description || batch.description || '';
  
  const { data: newPackage, error: packageError } = await supabaseClient
    .from('maintenance_packages')
    .insert({
      member_id: memberId,
      vehicle_id: item.vehicle_id,
      title: `${packageTitle} - ${vehicleName}`,
      description: packageDescription,
      category: batch.service_type || 'maintenance',
      service_type: batch.service_type || 'general',
      preferred_schedule: item.scheduled_date || null,
      status: 'open',
      is_bulk_item: true,
      bulk_batch_id: batchId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (packageError) {
    return { data: null, error: packageError };
  }
  
  // 5. Update the bulk_service_item with the package_id
  const { error: updateError } = await supabaseClient
    .from('bulk_service_items')
    .update({
      package_id: newPackage.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', itemId);
  
  if (updateError) {
    console.error('Failed to link bulk item to package:', updateError);
  }
  
  return { data: newPackage, error: null };
}

// Helper function to create maintenance packages for all items in a bulk batch
// Get batch details and items, for each item create maintenance_package and update item with package_id
async function createPackagesForBulkBatch(batchId) {
  const { data: batch, error: batchError } = await supabaseClient
    .from('bulk_service_batches')
    .select('id, name, service_type, description')
    .eq('id', batchId)
    .single();
  
  if (batchError || !batch) {
    return { data: null, error: batchError || 'Batch not found', packagesCreated: [] };
  }
  
  const { data: items, error: itemsError } = await supabaseClient
    .from('bulk_service_items')
    .select('id, package_id')
    .eq('batch_id', batchId);
  
  if (itemsError) {
    return { data: null, error: itemsError, packagesCreated: [] };
  }
  
  const packagesCreated = [];
  for (const item of items || []) {
    if (!item.package_id) {
      const result = await createPackageFromBulkItem(batchId, item.id);
      packagesCreated.push({ itemId: item.id, ...result });
    }
  }
  
  return { data: batch, error: null, packagesCreated };
}

// Links an existing package to a bulk item
async function linkBulkItemToPackage(itemId, packageId) {
  const { data, error } = await supabaseClient
    .from('bulk_service_items')
    .update({
      package_id: packageId,
      updated_at: new Date().toISOString()
    })
    .eq('id', itemId)
    .select()
    .single();
  
  return { data, error };
}

// Approve or reject a bulk service batch
async function approveBulkBatch(batchId, approverId) {
  const { data: batch } = await supabaseClient
    .from('bulk_service_batches')
    .select('fleet_id')
    .eq('id', batchId)
    .single();
  
  if (!batch) {
    return { data: null, error: 'Batch not found' };
  }
  
  const { data: fleet } = await supabaseClient
    .from('fleets')
    .select('owner_id')
    .eq('id', batch.fleet_id)
    .single();
  
  const isOwner = fleet?.owner_id === approverId;
  
  if (!isOwner) {
    const { data: membership } = await supabaseClient
      .from('fleet_members')
      .select('role')
      .eq('fleet_id', batch.fleet_id)
      .eq('user_id', approverId)
      .eq('status', 'active')
      .single();
    
    if (!membership || (membership.role !== 'manager' && membership.role !== 'owner')) {
      return { data: null, error: 'Only fleet owners or managers can approve batches' };
    }
  }
  
  const { data, error } = await supabaseClient
    .from('bulk_service_batches')
    .update({
      status: 'approved',
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', batchId)
    .select(`
      *,
      created_by_user:created_by(id)
    `)
    .single();
  
  if (!error && data?.created_by_user?.id) {
    await createNotification(
      data.created_by_user.id,
      'bulk_batch_approved',
      'Bulk Service Batch Approved ✅',
      `Your bulk service batch "${data.name}" has been approved.`,
      'fleet',
      data.fleet_id
    );
  }
  
  // After approval, create maintenance_packages for all pending items
  if (!error) {
    const { data: pendingItems } = await supabaseClient
      .from('bulk_service_items')
      .select('id')
      .eq('batch_id', batchId)
      .eq('status', 'pending');
    
    if (pendingItems && pendingItems.length > 0) {
      const packageResults = [];
      for (const item of pendingItems) {
        const result = await createPackageFromBulkItem(batchId, item.id);
        packageResults.push({ itemId: item.id, ...result });
      }
      return { data, error, packagesCreated: packageResults };
    }
  }
  
  return { data, error };
}

// Update the status of a bulk service item
async function updateBulkItemStatus(itemId, status, packageId = null) {
  // First get the current item to access batch_id and package_id
  const { data: currentItem, error: fetchError } = await supabaseClient
    .from('bulk_service_items')
    .select('batch_id, package_id')
    .eq('id', itemId)
    .single();
  
  if (fetchError) {
    return { data: null, error: fetchError };
  }
  
  const updatePayload = {
    status: status,
    updated_at: new Date().toISOString()
  };
  
  if (packageId) {
    updatePayload.package_id = packageId;
  }
  
  if (status === 'completed') {
    updatePayload.completed_at = new Date().toISOString();
  }
  
  // When status changes to "scheduled", create the maintenance_package if it doesn't exist
  if (status === 'scheduled' && !currentItem.package_id && !packageId) {
    const packageResult = await createPackageFromBulkItem(currentItem.batch_id, itemId);
    if (packageResult.data && !packageResult.error) {
      updatePayload.package_id = packageResult.data.id;
    }
  }
  
  const { data, error } = await supabaseClient
    .from('bulk_service_items')
    .update(updatePayload)
    .eq('id', itemId)
    .select()
    .single();
  
  // When status changes to "completed", update the linked maintenance_package status
  if (!error && status === 'completed') {
    const linkedPackageId = data.package_id || currentItem.package_id;
    if (linkedPackageId) {
      await supabaseClient
        .from('maintenance_packages')
        .update({
          status: 'completed',
          work_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', linkedPackageId);
    }
  }
  
  // When status changes to "in_progress", update the linked maintenance_package status
  if (!error && status === 'in_progress') {
    const linkedPackageId = data.package_id || currentItem.package_id;
    if (linkedPackageId) {
      await supabaseClient
        .from('maintenance_packages')
        .update({
          status: 'in_progress',
          work_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', linkedPackageId);
    }
  }
  
  return { data, error };
}

// Export bulk service scheduling functions
window.createBulkServiceBatch = createBulkServiceBatch;
window.getFleetBulkBatches = getFleetBulkBatches;
window.getBulkBatchDetails = getBulkBatchDetails;
window.addVehiclesToBulkBatch = addVehiclesToBulkBatch;
window.submitBatchForApproval = submitBatchForApproval;
window.approveBulkBatch = approveBulkBatch;
window.updateBulkItemStatus = updateBulkItemStatus;
window.createPackageFromBulkItem = createPackageFromBulkItem;
window.createPackagesForBulkBatch = createPackagesForBulkBatch;
window.linkBulkItemToPackage = linkBulkItemToPackage;
