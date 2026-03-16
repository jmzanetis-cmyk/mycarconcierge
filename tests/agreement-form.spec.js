const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const agreementFormContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'agreement-form.js'), 'utf8');
const serverContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'server.js'), 'utf8');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

test.describe('Agreement Form Module Structure', () => {

  test('AgreementForm IIFE module exists and exports createSignaturePad, createAgreementForm', async () => {
    expect(agreementFormContent).toContain('var AgreementForm = (function()');
    expect(agreementFormContent).toContain('function createSignaturePad(containerId)');
    expect(agreementFormContent).toContain('function createAgreementForm(options)');
    expect(agreementFormContent).toContain('createSignaturePad: createSignaturePad');
    expect(agreementFormContent).toContain('createAgreementForm: createAgreementForm');
  });

  test('Module injects styles with id agreement-form-styles', async () => {
    expect(agreementFormContent).toContain("styles.id = 'agreement-form-styles'");
    expect(agreementFormContent).toContain("document.getElementById('agreement-form-styles')");
    expect(agreementFormContent).toContain('function injectStyles()');
  });

  test('Both dark-mode and light-mode CSS classes are defined', async () => {
    expect(agreementFormContent).toContain('.agreement-form.dark-mode');
    expect(agreementFormContent).toContain('.agreement-form.light-mode');
    expect(agreementFormContent).toContain('.dark-mode .agreement-form-section h3');
    expect(agreementFormContent).toContain('.light-mode .agreement-form-section h3');
    expect(agreementFormContent).toContain('.dark-mode .sig-tab');
    expect(agreementFormContent).toContain('.light-mode .sig-tab');
  });
});

test.describe('Signature Pad', () => {

  test('Signature pad creates canvas element with correct dimensions (500x150)', async () => {
    expect(agreementFormContent).toContain('id="signature-canvas" width="500" height="150"');
    expect(agreementFormContent).toContain("canvas = container.querySelector('#signature-canvas')");
  });

  test('Two signature tabs exist: Draw Signature and Type Signature', async () => {
    expect(agreementFormContent).toContain('data-tab="draw">Draw Signature</button>');
    expect(agreementFormContent).toContain('data-tab="type">Type Signature</button>');
    expect(agreementFormContent).toContain('class="sig-tab active" data-tab="draw"');
    expect(agreementFormContent).toContain('class="sig-tab" data-tab="type"');
  });

  test('Clear button resets canvas', async () => {
    expect(agreementFormContent).toContain('class="clear-signature-btn">Clear</button>');
    expect(agreementFormContent).toContain("container.querySelector('.clear-signature-btn').addEventListener('click'");
    expect(agreementFormContent).toContain('function clearCanvas(isDarkMode)');
    expect(agreementFormContent).toContain('ctx.fillRect(0, 0, canvas.width, canvas.height)');
  });

  test('Typed signature updates preview element', async () => {
    expect(agreementFormContent).toContain("container.querySelector('#typed-signature')");
    expect(agreementFormContent).toContain("container.querySelector('.typed-signature-preview')");
    expect(agreementFormContent).toContain('preview.textContent = typedInput.value');
    expect(agreementFormContent).toContain('class="typed-signature-preview"');
  });

  test('Canvas supports mouse and touch events', async () => {
    expect(agreementFormContent).toContain("canvas.addEventListener('mousedown', startDrawing)");
    expect(agreementFormContent).toContain("canvas.addEventListener('mousemove', draw)");
    expect(agreementFormContent).toContain("canvas.addEventListener('mouseup', stopDrawing)");
    expect(agreementFormContent).toContain("canvas.addEventListener('mouseout', stopDrawing)");
    expect(agreementFormContent).toContain("canvas.addEventListener('touchstart', startDrawing");
    expect(agreementFormContent).toContain("canvas.addEventListener('touchmove', draw");
    expect(agreementFormContent).toContain("canvas.addEventListener('touchend', stopDrawing)");
  });
});

test.describe('Form Validation', () => {

  test('Full name field is required', async () => {
    expect(agreementFormContent).toContain("name=\"full_name\" required");
    expect(agreementFormContent).toContain("form.querySelector('[name=\"full_name\"]')");
    expect(agreementFormContent).toContain("!fullNameField.value.trim()");
    expect(agreementFormContent).toContain("Please enter your full legal name.");
  });

  test('EIN/SSN last 4 digits validates 4-digit pattern', async () => {
    expect(agreementFormContent).toContain('pattern="[0-9]{4}"');
    expect(agreementFormContent).toContain('maxlength="4"');
    expect(agreementFormContent).toContain('/^[0-9]{4}$/.test(einField.value)');
    expect(agreementFormContent).toContain('Please enter the last 4 digits of your EIN or SSN.');
  });

  test('Email field validates @ symbol', async () => {
    expect(agreementFormContent).toContain("emailField.value.indexOf('@') === -1");
    expect(agreementFormContent).toContain('Please enter a valid email address.');
    expect(agreementFormContent).toContain('type="email" id="agreement-email"');
  });

  test('All acknowledgment checkboxes must be checked', async () => {
    expect(agreementFormContent).toContain(".querySelectorAll('.acknowledgment-item input[type=\"checkbox\"]')");
    expect(agreementFormContent).toContain('!ackCheckboxes[i].checked');
    expect(agreementFormContent).toContain('Please check all acknowledgment boxes before signing.');
  });

  test('Signature is required (either drawn or typed)', async () => {
    expect(agreementFormContent).toContain('var signatureData = getSignatureData()');
    expect(agreementFormContent).toContain('if (!signatureData)');
    expect(agreementFormContent).toContain('Please provide your signature by drawing or typing your name.');
  });

  test('Final confirmation checkbox required', async () => {
    expect(agreementFormContent).toContain("document.getElementById('final-agreement-confirm')");
    expect(agreementFormContent).toContain('!finalConfirm.checked');
    expect(agreementFormContent).toContain('Please check the final confirmation box to confirm you agree to the terms.');
  });
});

test.describe('Form Submission', () => {

  test('Agreement sign endpoint exists (POST /api/agreements/sign)', async () => {
    expect(serverContent).toContain("/api/agreements/sign");
    expect(agreementFormContent).toContain("fetch('/api/agreements/sign'");
    expect(agreementFormContent).toContain("method: 'POST'");
    expect(agreementFormContent).toContain("'Content-Type': 'application/json'");
  });

  test('Submit button shows loading state during submission', async () => {
    expect(agreementFormContent).toContain('class="btn-text">Sign Agreement</span>');
    expect(agreementFormContent).toContain('class="btn-loading" style="display:none;">Submitting...</span>');
    expect(agreementFormContent).toContain('btn.disabled = true');
    expect(agreementFormContent).toContain("btnText.style.display = 'none'");
    expect(agreementFormContent).toContain("btnLoading.style.display = 'inline'");
  });

  test('Success message displays with reference ID and date', async () => {
    expect(agreementFormContent).toContain('function showSuccessMessage(container, result)');
    expect(agreementFormContent).toContain('Agreement Signed Successfully');
    expect(agreementFormContent).toContain('<strong>Reference:</strong>');
    expect(agreementFormContent).toContain('<strong>Signed on:</strong>');
    expect(agreementFormContent).toContain('new Date().toLocaleDateString()');
  });
});

test.describe('Theme Support', () => {

  test('Canvas colors change with theme (dark: #d4a855 stroke, light: #1e3a5f)', async () => {
    expect(agreementFormContent).toContain("ctx.strokeStyle = isDarkMode ? '#d4a855' : '#1e3a5f'");
    expect(agreementFormContent).toContain("ctx.fillStyle = isDarkMode ? '#1a1a2e' : '#ffffff'");
    expect(agreementFormContent).toContain('function updateCanvasColors(canvas, isDarkMode)');
  });

  test('MutationObserver watches for data-theme attribute changes', async () => {
    expect(agreementFormContent).toContain('new MutationObserver');
    expect(agreementFormContent).toContain("mutations[mi].attributeName === 'data-theme'");
    expect(agreementFormContent).toContain("themeObserver.observe(document.documentElement");
    expect(agreementFormContent).toContain("attributeFilter: ['data-theme']");
    expect(agreementFormContent).toContain('updateCanvasColors(canvas, newIsDarkMode)');
  });
});
