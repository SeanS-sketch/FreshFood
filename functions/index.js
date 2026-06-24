/**
 * FreshFood Cloud Functions — transactional email via Gmail SMTP.
 * Secrets (do NOT commit): firebase functions:secrets:set GMAIL_USER GMAIL_APP_PASSWORD
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

const gmailUser = defineSecret('GMAIL_USER');
const gmailPass = defineSecret('GMAIL_APP_PASSWORD');
const SUPPORT_INBOX = 'freshfood.support@gmail.com';

/** Build nodemailer transport from secrets stored in Firebase Secret Manager. */
function createTransport(user, pass) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

/** Send support email to inbox + confirmation to user. */
exports.sendSupportEmail = onCall(
  { secrets: [gmailUser, gmailPass], cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { message, subject } = request.data || {};
    if (!message || typeof message !== 'string' || message.length > 5000) {
      throw new HttpsError('invalid-argument', 'A valid message is required.');
    }
    const email = request.auth.token.email || '';
    const name = request.auth.token.name || email.split('@')[0];
    const transport = createTransport(gmailUser.value(), gmailPass.value());
    const subj = subject || `FreshFood support from ${name}`;

    await transport.sendMail({
      from: `"FreshFood Support" <${gmailUser.value()}>`,
      to: SUPPORT_INBOX,
      replyTo: email,
      subject: subj,
      text: `From: ${name} <${email}>\n\n${message}`,
    });

    await transport.sendMail({
      from: `"FreshFood" <${gmailUser.value()}>`,
      to: email,
      subject: 'We received your FreshFood support request',
      text: `Hi ${name},\n\nThanks for contacting FreshFood support. We received your message and will reply soon.\n\n— FreshFood Team`,
    });

    return { ok: true };
  },
);

/** Welcome email after signup (called from client post-signup). */
exports.sendWelcomeEmail = onCall(
  { secrets: [gmailUser, gmailPass], cors: true },
  async (request) => {
    const { email, displayName } = request.data || {};
    if (!email) throw new HttpsError('invalid-argument', 'Email required.');
    const transport = createTransport(gmailUser.value(), gmailPass.value());
    await transport.sendMail({
      from: `"FreshFood" <${gmailUser.value()}>`,
      to: email,
      subject: 'Welcome to FreshFood',
      text: `Hi ${displayName || 'there'},\n\nWelcome to FreshFood! Track what's in your fridge and cabinet, get expiry reminders, and find recipes to use food before it goes bad.\n\nVerify your email to start syncing your pantry.\n\n— FreshFood Team`,
    });
    return { ok: true };
  },
);
