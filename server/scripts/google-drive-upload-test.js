const { Readable } = require('stream');
require('dotenv').config();
const { google } = require('googleapis');

async function main() {
  const required = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GOOGLE_DRIVE_RESTORE_TEST_FOLDER_ID',
  ];

  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing ${key}`);
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  const drive = google.drive({ version: 'v3', auth });
  const name = `aio-system-upload-test-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;

  const created = await drive.files.create({
    requestBody: {
      name,
      parents: [process.env.GOOGLE_DRIVE_RESTORE_TEST_FOLDER_ID],
      mimeType: 'text/plain',
    },
    media: {
      mimeType: 'text/plain',
      body: Readable.from(['AIO System Google Drive backup upload test. Safe to delete.\n']),
    },
    fields: 'id,name',
    supportsAllDrives: true,
  });

  await drive.files.delete({
    fileId: created.data.id,
    supportsAllDrives: true,
  });

  console.log(JSON.stringify({
    uploadCreated: true,
    uploadDeleted: true,
    uploadedName: created.data.name,
  }));
}

main().catch((err) => {
  console.error(err.message);
  if (err?.response?.data) console.error(JSON.stringify(err.response.data));
  process.exit(1);
});
