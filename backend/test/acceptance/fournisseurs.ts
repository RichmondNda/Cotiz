// Fournisseurs externes interdits avant le groupe 6 (règle 6 du dépôt, architecture/13 « Minimisation ») : liste unique,
// lue par le test d'acceptation (sans-fournisseur.test.ts) et par la recette `tools/sans-fournisseur.mjs`
// (environnement réel des conteneurs ; Node l'importe sans compilation). Aucun import : fichier autonome.

/** Préfixes de variables d'un fournisseur externe (canal ou service tiers). */
export const VARIABLE_FOURNISSEUR =
  /^(SMTP|MAIL|EMAIL|SENDGRID|MAILGUN|BREVO|POSTMARK|SES|SMS|TWILIO|VONAGE|NEXMO|INFOBIP|ORANGE|MTN|WAVE|MOOV|CINETPAY|PAYDUNYA|FEDAPAY|KKIAPAY|STRIPE|PAYPAL|FCM|FIREBASE|ONESIGNAL|RECAPTCHA|HCAPTCHA|TURNSTILE|GOOGLE)_/;

/** SDK d'un fournisseur externe (dépendances npm). */
export const SDK_FOURNISSEUR =
  /^(nodemailer|twilio|@sendgrid\/.*|mailgun.*|@getbrevo\/.*|postmark|@aws-sdk\/client-(ses|sns|sesv2)|firebase.*|onesignal.*|stripe|@paypal\/.*|cinetpay.*|paydunya.*|fedapay.*|kkiapay.*|react-google-recaptcha|vue-recaptcha.*|@hcaptcha\/.*|vue-hcaptcha|@google-cloud\/.*)$/;

/** Hôtes tiers interdits dans le code livré au navigateur ou au serveur. */
export const HOTE_FOURNISSEUR =
  /fonts\.googleapis\.com|fonts\.gstatic\.com|google\.com\/recaptcha|recaptcha\.net|hcaptcha\.com|challenges\.cloudflare\.com|api\.twilio\.com|api\.sendgrid\.com|api\.mailgun\.net|onesignal\.com|fcm\.googleapis\.com|cinetpay\.com|paydunya\.com|stripe\.com|sentinel\.altcha/;
