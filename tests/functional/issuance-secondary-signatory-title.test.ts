import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { seedUsers, createPersonnel, createAsset } from '../fixtures/assets';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let users: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  users = await seedUsers();
}, 30_000);

/** Extract text from a PDFKit-generated PDF buffer.
 *  PDFKit compresses content streams with FlateDecode and uses hex-encoded
 *  string literals inside TJ arrays: <48656c6c6f>. TJ arrays split words across
 *  multiple hex strings with kerning numbers between them, so we must join
 *  all hex strings within a single TJ array into one contiguous string. */
function extractPdfText(buffer: Buffer): string {
  const zlib = require('zlib');
  const text = buffer.toString('latin1');
  const results: string[] = [];

  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(text)) !== null) {
    const compressed = Buffer.from(match[1], 'latin1');
    let content: string;
    try {
      content = zlib.inflateSync(compressed).toString('latin1');
    } catch {
      content = match[1];
    }

    // TJ arrays: [<hex> -num <hex> ...] TJ — join all hex strings in each array
    const tjArrMatches = content.match(/\[([^\]]*)\]\s*TJ/g);
    if (tjArrMatches) {
      for (const arr of tjArrMatches) {
        const hexStrings = arr.match(/<([0-9a-fA-F]+)>/g);
        if (hexStrings) {
          const joined = hexStrings
            .map((hs: string) => {
              const hex = hs.match(/<([0-9a-fA-F]+)>/);
              return hex ? Buffer.from(hex[1], 'hex').toString('latin1') : '';
            })
            .join('');
          results.push(joined);
        }
        // Also handle parenthesized strings in TJ arrays
        const parenStrings = arr.match(/\(([^()]*)\)/g);
        if (parenStrings) {
          for (const ps of parenStrings) {
            results.push(ps.slice(1, -1));
          }
        }
      }
    }

    // Plain Tj with hex strings: <48656c6c6f> Tj
    const hexTjMatches = content.match(/<([0-9a-fA-F]+)>\s*Tj/g);
    if (hexTjMatches) {
      for (const hm of hexTjMatches) {
        const hex = hm.match(/<([0-9a-fA-F]+)>/);
        if (hex) results.push(Buffer.from(hex[1], 'hex').toString('latin1'));
      }
    }

    // Plain Tj with parenthesized strings: (text) Tj
    const tjMatches = content.match(/\(([^()]*)\)\s*Tj/g);
    if (tjMatches) {
      for (const tm of tjMatches) {
        results.push(tm.replace(/\(([^()]*)\)\s*Tj/, '$1'));
      }
    }
  }

  return results.join(' ');
}

describe('Issuance secondarySignatoryTitle', () => {
  async function createTemplateWithTitle(title: string, mode: string) {
    const res = await request(app)
      .post('/api/agreements/templates')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .field('name', `Title Test ${title} ${Date.now()}`)
      .field('content', 'ISSUANCE AGREEMENT\n\nRecipient: {{personnelName}}\nAsset: {{assetName}}')
      .field('isDefault', 'false')
      .field('signatoryMode', mode)
      .field('defaultPropertyOfficer', 'Toyota Gazoo')
      .field('secondarySignatoryTitle', title);
    expect(res.status).toBe(201);
    return res.body.data;
  }

  it('template with secondarySignatoryTitle snapshots the title on issuance', async () => {
    const template = await createTemplateWithTitle('Authorized Signatory', 'recipientPropertyOfficer');
    const personnel = await createPersonnel({ fullName: 'Title Test Recipient 1' });
    const asset = await createAsset({ name: 'Title Asset 1', adminToken: users.ADMIN.accessToken });

    const issueRes = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        assetId: asset.id,
        personnelId: personnel.id,
        agreementId: template.id,
      });
    expect(issueRes.status).toBe(201);

    const doc = await prisma.agreementDocument.findUnique({
      where: { id: issueRes.body.data.agreementDocumentId },
    });
    expect(doc?.secondarySignatoryTitle).toBe('Authorized Signatory');
    expect(doc?.propertyOfficerName).toBe('Toyota Gazoo');
  });

  it('issuance override with secondarySignatoryTitle snapshots the override', async () => {
    const template = await createTemplateWithTitle('Authorized Signatory', 'recipientPropertyOfficer');
    const personnel = await createPersonnel({ fullName: 'Title Test Recipient 2' });
    const asset = await createAsset({ name: 'Title Asset 2', adminToken: users.ADMIN.accessToken });

    const issueRes = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        assetId: asset.id,
        personnelId: personnel.id,
        agreementId: template.id,
        secondarySignatoryTitle: 'Person In Charge',
      });
    expect(issueRes.status).toBe(201);

    const doc = await prisma.agreementDocument.findUnique({
      where: { id: issueRes.body.data.agreementDocumentId },
    });
    expect(doc?.secondarySignatoryTitle).toBe('Person In Charge');
  });

  it('PDF preview from document snapshot includes custom title in rendered text', async () => {
    const template = await createTemplateWithTitle('Custodian', 'recipientPropertyOfficer');
    const personnel = await createPersonnel({ fullName: 'Title Test Recipient 3' });
    const asset = await createAsset({ name: 'Title Asset 3', adminToken: users.ADMIN.accessToken });

    const issueRes = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        assetId: asset.id,
        personnelId: personnel.id,
        agreementId: template.id,
      });
    expect(issueRes.status).toBe(201);

    const docId = issueRes.body.data.agreementDocumentId;

    const pdfRes = await request(app)
      .post('/api/agreements/pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        personnelName: personnel.fullName,
        assetName: asset.name,
        agreementDocumentId: docId,
      });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');

    const pdfText = extractPdfText(pdfRes.body);
    expect(pdfText).toContain('Custodian');
    expect(pdfText).not.toContain('Property Officer');
  });

  it('PDF preview with direct secondarySignatoryTitle param renders custom title', async () => {
    const personnel = await createPersonnel({ fullName: 'Title Test Recipient 4' });
    const asset = await createAsset({ name: 'Title Asset 4', adminToken: users.ADMIN.accessToken });

    const pdfRes = await request(app)
      .post('/api/agreements/pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        personnelName: personnel.fullName,
        assetName: asset.name,
        propertyOfficerName: 'Toyota Gazoo',
        secondarySignatoryTitle: 'Authorized Signatory',
        signatoryMode: 'recipientPropertyOfficer',
      });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');

    const pdfText = extractPdfText(pdfRes.body);
    expect(pdfText).toContain('Authorized Signatory');
    expect(pdfText).toContain('Toyota Gazoo');
    expect(pdfText).not.toContain('Property Officer');
  });

  it('bulk issuance with secondarySignatoryTitle snapshots the title', async () => {
    const template = await createTemplateWithTitle('Project Lead', 'recipientPropertyOfficerAuthorizedRep');
    const personnel = await createPersonnel({ fullName: 'Title Test Bulk Recipient' });
    const asset1 = await createAsset({ name: 'Bulk Title Asset 1', adminToken: users.ADMIN.accessToken });
    const asset2 = await createAsset({ name: 'Bulk Title Asset 2', adminToken: users.ADMIN.accessToken });

    const bulkRes = await request(app)
      .post('/api/issuances/bulk')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        personnelId: personnel.id,
        assetIds: [asset1.id, asset2.id],
        agreementTemplateId: template.id,
        secondarySignatoryTitle: 'Accountable Officer',
      });
    expect(bulkRes.status).toBe(201);

    const docId = bulkRes.body.data.agreementDocumentId;
    expect(docId).toBeTruthy();
    const doc = await prisma.agreementDocument.findUnique({
      where: { id: docId },
    });
    expect(doc?.secondarySignatoryTitle).toBe('Accountable Officer');
  });

  it('existing document without secondarySignatoryTitle still renders Property Officer', async () => {
    // Create template WITHOUT secondarySignatoryTitle
    const res = await request(app)
      .post('/api/agreements/templates')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .field('name', `No Title Test ${Date.now()}`)
      .field('content', 'ISSUANCE AGREEMENT\n\nRecipient: {{personnelName}}')
      .field('isDefault', 'false')
      .field('signatoryMode', 'recipientPropertyOfficer')
      .field('defaultPropertyOfficer', 'Legacy Officer');
    expect(res.status).toBe(201);
    const template = res.body.data;

    const personnel = await createPersonnel({ fullName: 'Legacy Title Recipient' });
    const asset = await createAsset({ name: 'Legacy Title Asset', adminToken: users.ADMIN.accessToken });

    const issueRes = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        assetId: asset.id,
        personnelId: personnel.id,
        agreementId: template.id,
      });
    expect(issueRes.status).toBe(201);

    const doc = await prisma.agreementDocument.findUnique({
      where: { id: issueRes.body.data.agreementDocumentId },
    });
    expect(doc?.secondarySignatoryTitle).toBeNull();

    // PDF should still render and show "Property Officer" as fallback
    const pdfRes = await request(app)
      .post('/api/agreements/pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        personnelName: personnel.fullName,
        assetName: asset.name,
        agreementDocumentId: doc?.id,
      });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');

    const pdfText = extractPdfText(pdfRes.body);
    expect(pdfText).toContain('Property Officer');
  });

  it('custom title "Director" appears in PDF text and does not show Property Officer', async () => {
    const template = await createTemplateWithTitle('Director', 'recipientPropertyOfficer');
    const personnel = await createPersonnel({ fullName: 'Director Test Recipient' });
    const asset = await createAsset({ name: 'Director Asset', adminToken: users.ADMIN.accessToken });

    const issueRes = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, personnelId: personnel.id, agreementId: template.id });
    expect(issueRes.status).toBe(201);

    const pdfRes = await request(app)
      .post('/api/agreements/pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        personnelName: personnel.fullName,
        assetName: asset.name,
        agreementDocumentId: issueRes.body.data.agreementDocumentId,
      });
    expect(pdfRes.status).toBe(200);

    const pdfText = extractPdfText(pdfRes.body);
    expect(pdfText).toContain('Director');
    expect(pdfText).not.toContain('Property Officer');
  });

  it('custom title "Project Director" appears in bulk issuance PDF text', async () => {
    const template = await createTemplateWithTitle('Project Director', 'recipientPropertyOfficerAuthorizedRep');
    const personnel = await createPersonnel({ fullName: 'PD Bulk Recipient' });
    const asset1 = await createAsset({ name: 'PD Bulk Asset 1', adminToken: users.ADMIN.accessToken });
    const asset2 = await createAsset({ name: 'PD Bulk Asset 2', adminToken: users.ADMIN.accessToken });

    const bulkRes = await request(app)
      .post('/api/issuances/bulk')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ personnelId: personnel.id, assetIds: [asset1.id, asset2.id], agreementTemplateId: template.id });
    expect(bulkRes.status).toBe(201);

    const pdfRes = await request(app)
      .post('/api/agreements/pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        personnelName: personnel.fullName,
        assetName: `${2} assets`,
        agreementDocumentId: bulkRes.body.data.agreementDocumentId,
      });
    expect(pdfRes.status).toBe(200);

    const pdfText = extractPdfText(pdfRes.body);
    expect(pdfText).toContain('Project Director');
    expect(pdfText).not.toContain('Property Officer');
  });

  it('custom firstSignatoryTitle "Director" appears in PDF text, not "Authorized Representative"', async () => {
    const template = await createTemplateWithTitle('Custodian', 'recipientPropertyOfficerAuthorizedRep');
    // Update template to also set firstSignatoryTitle
    await request(app)
      .patch(`/api/agreements/templates/${template.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .field('firstSignatoryTitle', 'Director')
      .field('defaultAuthorizedRep', 'Maria Santos');

    const personnel = await createPersonnel({ fullName: 'First Sig Recipient' });
    const asset = await createAsset({ name: 'First Sig Asset', adminToken: users.ADMIN.accessToken });

    const issueRes = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, personnelId: personnel.id, agreementId: template.id });
    expect(issueRes.status).toBe(201);

    const pdfRes = await request(app)
      .post('/api/agreements/pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        personnelName: personnel.fullName,
        assetName: asset.name,
        agreementDocumentId: issueRes.body.data.agreementDocumentId,
      });
    expect(pdfRes.status).toBe(200);

    const pdfText = extractPdfText(pdfRes.body);
    expect(pdfText).toContain('Director');
    expect(pdfText).not.toContain('Authorized Representative');
  });

  it('legacy document without firstSignatoryTitle still renders Authorized Representative in PDF', async () => {
    // Create template without firstSignatoryTitle
    const res = await request(app)
      .post('/api/agreements/templates')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .field('name', `Legacy First Sig ${Date.now()}`)
      .field('content', 'ISSUANCE AGREEMENT\n\nRecipient: {{personnelName}}')
      .field('isDefault', 'false')
      .field('signatoryMode', 'recipientPropertyOfficerAuthorizedRep')
      .field('defaultPropertyOfficer', 'Legacy Officer')
      .field('defaultAuthorizedRep', 'Legacy Rep');
    expect(res.status).toBe(201);
    const template = res.body.data;

    const personnel = await createPersonnel({ fullName: 'Legacy First Sig Recipient' });
    const asset = await createAsset({ name: 'Legacy First Sig Asset', adminToken: users.ADMIN.accessToken });

    const issueRes = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, personnelId: personnel.id, agreementId: template.id });
    expect(issueRes.status).toBe(201);

    const doc = await prisma.agreementDocument.findUnique({
      where: { id: issueRes.body.data.agreementDocumentId },
    });
    expect(doc?.firstSignatoryTitle).toBeNull();

    const pdfRes = await request(app)
      .post('/api/agreements/pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        personnelName: personnel.fullName,
        assetName: asset.name,
        agreementDocumentId: doc?.id,
      });
    expect(pdfRes.status).toBe(200);

    const pdfText = extractPdfText(pdfRes.body);
    expect(pdfText).toContain('Authorized Representative');
  });
});