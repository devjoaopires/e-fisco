'use strict';

function requiredText(value, fieldName) {
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    throw new Error(`${fieldName} é obrigatório para o cache offline.`);
  }
  return text;
}

function parseJsonText(value) {
  if (value == null || value === '') return null;
  try { return JSON.parse(String(value)); } catch (_) { return null; }
}

function normalizeLimit(value, defaultValue = 50, maxValue = 200) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return defaultValue;
  return Math.min(Math.trunc(number), maxValue);
}

function mapNfceDocumentRow(row) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    fiscalId: String(row.fiscal_id),
    saleId: String(row.sale_id),
    operationId: String(row.operation_id),
    leaseId: String(row.lease_id),
    ambiente: String(row.ambiente),
    modelo: Number(row.modelo),
    serie: String(row.serie),
    numero: Number(row.numero),
    cnf: String(row.cnf),
    cdv: String(row.cdv),
    chaveAcesso: String(row.chave_acesso),
    tpEmis: Number(row.tp_emis),
    dhEmi: String(row.dh_emi),
    dhCont: String(row.dh_cont),
    xJust: String(row.x_just),
    profileRevision: String(row.profile_revision),

    inputSnapshot: parseJsonText(row.input_snapshot_json),

    signedXml: row.signed_xml == null ? null : Buffer.from(row.signed_xml),

    signedXmlSha256: row.signed_xml_sha256 == null ? null : String(row.signed_xml_sha256),

    qrCodeText: row.qr_code_text == null ? null : String(row.qr_code_text),

    state: String(row.state),
    protocolo: row.protocolo == null ? null : String(row.protocolo),
    sefazCStat: row.sefaz_cstat == null ? null : String(row.sefaz_cstat),
    sefazXMotivo: row.sefaz_xmotivo == null ? null : String(row.sefaz_xmotivo),
    autorizadoEm: row.autorizado_em == null ? null : String(row.autorizado_em),
    processedXml: row.processed_xml == null ? null : Buffer.from(row.processed_xml),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function getNfceDocumentBySaleId(db, empresaIdValue, saleIdValue) {
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const saleId = requiredText(saleIdValue, 'saleId');
  const row = db.prepare(`
    SELECT empresa_id, fiscal_id, sale_id, operation_id, lease_id,
           ambiente, modelo, serie, numero, cnf, cdv, chave_acesso,
           tp_emis, dh_emi, dh_cont, x_just, profile_revision,
           input_snapshot_json, signed_xml, signed_xml_sha256, qr_code_text,
           state, protocolo, sefaz_cstat, sefaz_xmotivo, autorizado_em, processed_xml,
           created_at, updated_at
      FROM nfce_documents
     WHERE empresa_id = ? AND sale_id = ?
     LIMIT 1
  `).get(empresaId, saleId);
  return mapNfceDocumentRow(row);
}

function getNfceDocumentByFiscalId(db, empresaIdValue, fiscalIdValue) {
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const fiscalId = requiredText(fiscalIdValue, 'fiscalId');
  const row = db.prepare(`
    SELECT empresa_id, fiscal_id, sale_id, operation_id, lease_id,
           ambiente, modelo, serie, numero, cnf, cdv, chave_acesso,
           tp_emis, dh_emi, dh_cont, x_just, profile_revision,
           input_snapshot_json, signed_xml, signed_xml_sha256, qr_code_text,
           state, protocolo, sefaz_cstat, sefaz_xmotivo, autorizado_em,
           processed_xml, created_at, updated_at
      FROM nfce_documents
     WHERE empresa_id = ? AND fiscal_id = ?
     LIMIT 1
  `).get(empresaId, fiscalId);
  return mapNfceDocumentRow(row);
}

function listAuthorizedNfcePendingSync(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const limit = normalizeLimit(input.limit, 50, 200);
  const rows = db.prepare(`
    SELECT d.fiscal_id, d.sale_id, d.ambiente, d.modelo, d.serie, d.numero,
           d.chave_acesso, d.tp_emis, d.dh_emi, d.protocolo,
           d.sefaz_cstat, d.sefaz_xmotivo, d.autorizado_em, d.processed_xml,
           d.updated_at,
           (
             SELECT s2.operation_id
               FROM sync_outbox AS s2
              WHERE s2.empresa_id = d.empresa_id
                AND s2.entity_id = d.sale_id
                AND s2.type = 'SALE_PAID'
              ORDER BY s2.created_at ASC
              LIMIT 1
           ) AS sale_sync_operation_id
      FROM nfce_documents AS d
      JOIN fiscal_outbox AS f
        ON f.empresa_id = d.empresa_id
       AND f.fiscal_id = d.fiscal_id
     WHERE d.empresa_id = ?
       AND d.state = 'AUTHORIZED'
       AND f.status = 'CONFIRMED'
       AND d.processed_xml IS NOT NULL
       AND d.protocolo IS NOT NULL
       AND d.sefaz_cstat IN ('100','150')
       AND d.ambiente = 'PRODUCAO'
       AND d.modelo = 65
       AND d.tp_emis = 9
       AND NOT EXISTS (
         SELECT 1
           FROM sync_outbox AS s
          WHERE s.empresa_id = d.empresa_id
            AND s.operation_id =
              ('nfce-auth:' || d.fiscal_id)
       )
     ORDER BY d.updated_at ASC
     LIMIT ?
  `).all(empresaId, limit);

  return rows.map((row) => ({
    fiscalId: String(row.fiscal_id),
    saleId: String(row.sale_id),
    ambiente: String(row.ambiente),
    modelo: Number(row.modelo),
    serie: String(row.serie),
    numero: Number(row.numero),
    chaveAcesso: String(row.chave_acesso),
    tipoEmissao: Number(row.tp_emis),
    dataHoraEmissao: String(row.dh_emi),
    protocolo: String(row.protocolo),
    cStat: String(row.sefaz_cstat),
    xMotivo: row.sefaz_xmotivo == null
      ? null
      : String(row.sefaz_xmotivo),
    autorizadoEm: String(row.autorizado_em),
    processedXml: Buffer.from(row.processed_xml),
    updatedAt: String(row.updated_at),
    saleSyncOperationId: row.sale_sync_operation_id == null
      ? null
      : String(row.sale_sync_operation_id)
  }));
}

module.exports = {
  getNfceDocumentBySaleId,
  getNfceDocumentByFiscalId,
  listAuthorizedNfcePendingSync
};
