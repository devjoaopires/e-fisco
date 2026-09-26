'use strict';

const {
  getFiscalProfileCache,
  getActiveFiscalNumberLease,
  getFiscalNumberLeaseById,
  getNfceDocumentBySaleId,
  getSaleById,
  ensureFiscalOutboxForPendingNfce,
  registerOfflineSaleAtomic
} = require('./offline-db');
const {
  inspectFiscalA1Bundle,
  hasStoredFiscalA1Bundle
} = require('./offline-fiscal-certificate-store');
const {
  finalizeNfceContingencySigning
} = require('./offline-fiscal-contingency-service');
const {
  finalizeNfceContingencyQrCode
} = require('./offline-fiscal-nfce-qrcode');
const {
  generateDanfeContingencyForSale
} = require('./offline-fiscal-nfce-danfe');

const ALLOWED_CSOSN = new Set(['102', '103', '300', '400']);
const ALLOWED_PIS_COFINS = new Set(['04', '05', '06', '07', '08', '09']);
const ALLOWED_PAYMENT_METHODS = new Set(['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO']);

function normalizePaymentMethod(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function digits(value) {
  return text(value).replace(/\D/g, '');
}

function decimalFractionDigits(value) {
  const raw = text(value).replace(',', '.');
  const match = raw.match(/^\d+(?:\.(\d+))?$/);
  if (!match) return -1;
  return String(match[1] || '').replace(/0+$/, '').length;
}

function sameNumber(value, expected) {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number - expected) < 0.0000001;
}

function validPercentage(value) {
  const raw = text(value).replace(',', '.');
  if (!/^\d+(?:\.\d{1,4})?$/.test(raw)) return false;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 && number <= 100;
}

function rtcRequiredForSale(input) {
  const raw = text(input && input.occurredAt);
  const date = new Date(raw);
  if (!raw || Number.isNaN(date.getTime())) return true;
  const paDate = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return paDate.getUTCFullYear() >= 2027;
}

function validateCurrentSupportedSubset(input) {
  if (!input || typeof input !== 'object') return { eligible: false, reason: 'SALE_INPUT_INVALID' };
  const requireRtc = rtcRequiredForSale(input);
  if (input.payload && input.payload.vendaInterna === true) {
    return { eligible: false, reason: 'VENDA_INTERNA' };
  }
  const parts = Array.isArray(input.paymentParts) ? input.paymentParts : [];
  if (!parts.length || parts.length > 100) {
    return { eligible: false, reason: 'PAGAMENTO_FORA_DO_SUBCONJUNTO' };
  }
  for (const part of parts) {
    const method = normalizePaymentMethod(
      part && (
        part.method ||
        part.metodo ||
        part.paymentMethod
      )
    );
    if (!ALLOWED_PAYMENT_METHODS.has(method)) {
      return { eligible: false, reason: 'PAGAMENTO_FORA_DO_SUBCONJUNTO' };
    }
  }
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length || items.length > 990) {
    return { eligible: false, reason: 'QUANTIDADE_ITENS_FORA_DO_SUBCONJUNTO' };
  }
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
    if (!/^\d{8}$/.test(digits(payload.ncm))) return { eligible: false, reason: `ITEM_${index + 1}_NCM` };
    if (!/^\d{4}$/.test(digits(payload.cfop))) return { eligible: false, reason: `ITEM_${index + 1}_CFOP` };
    if (!/^[0-8]$/.test(digits(payload.origem))) return { eligible: false, reason: `ITEM_${index + 1}_ORIGEM` };
    if (!ALLOWED_CSOSN.has(digits(payload.csosn))) return { eligible: false, reason: `ITEM_${index + 1}_CSOSN` };
    const pis = digits(payload.cstPis).padStart(2, '0');
    const cofins = digits(payload.cstCofins).padStart(2, '0');
    if (!ALLOWED_PIS_COFINS.has(pis) && pis !== '99') {
      return { eligible: false, reason: `ITEM_${index + 1}_PIS` };
    }
    if (!ALLOWED_PIS_COFINS.has(cofins) && cofins !== '99') {
      return { eligible: false, reason: `ITEM_${index + 1}_COFINS` };
    }
    if (pis === '99' && !validPercentage(payload.aliquotaPis)) {
      return { eligible: false, reason: `ITEM_${index + 1}_PIS_ALIQUOTA` };
    }
    if (cofins === '99' && !validPercentage(payload.aliquotaCofins)) {
      return { eligible: false, reason: `ITEM_${index + 1}_COFINS_ALIQUOTA` };
    }
    if (requireRtc) {
      const rtc = payload.rtc && typeof payload.rtc === 'object' && !Array.isArray(payload.rtc)
        ? payload.rtc
        : {};
      const cstRtc = text(rtc.cst || rtc.CST || payload.cstIbsCbs);
      const classRtc = text(rtc.cClassTrib || payload.cClassTrib);
      if (cstRtc !== '000' || classRtc !== '000001') {
        return { eligible: false, reason: `ITEM_${index + 1}_RTC_CLASSIFICACAO` };
      }
      if (!sameNumber(rtc.pIBSUF != null ? rtc.pIBSUF : payload.pIBSUF, 0.1)) {
        return { eligible: false, reason: `ITEM_${index + 1}_RTC_IBS_UF` };
      }
      if (!sameNumber(rtc.pIBSMun != null ? rtc.pIBSMun : payload.pIBSMun, 0)) {
        return { eligible: false, reason: `ITEM_${index + 1}_RTC_IBS_MUN` };
      }
      if (!sameNumber(rtc.pCBS != null ? rtc.pCBS : payload.pCBS, 0.9)) {
        return { eligible: false, reason: `ITEM_${index + 1}_RTC_CBS` };
      }
    }
    const fractionDigits = decimalFractionDigits(item.quantidade);
    if (fractionDigits < 0 || fractionDigits > 4) {
      return { eligible: false, reason: `ITEM_${index + 1}_QUANTIDADE_PRECISAO` };
    }
  }
  return { eligible: true, reason: null };
}

function validateProfile(profile) {
  if (!profile) return { ready: false, reason: 'FISCAL_PROFILE_AUSENTE' };
  if (text(profile.ambiente).toUpperCase() !== 'PRODUCAO') return { ready: false, reason: 'AMBIENTE_NAO_PRODUCAO' };
  if (text(profile.uf).toUpperCase() !== 'PA') return { ready: false, reason: 'UF_NAO_PA' };
  if (text(profile.crt) !== '1') return { ready: false, reason: 'CRT_NAO_SUPORTADO' };
  if (!/^\d{14}$/.test(digits(profile.cnpj))) return { ready: false, reason: 'CNPJ_NAO_SUPORTADO' };
  const serie = Number(profile.serieNfce);
  if (!Number.isSafeInteger(serie) || serie < 0 || serie > 889) return { ready: false, reason: 'SERIE_INVALIDA' };
  if (!/^15\d{5}$/.test(digits(profile.codigoMunicipio))) return { ready: false, reason: 'MUNICIPIO_FORA_PA' };
  for (const [name, value] of [['urlQrCode', profile.urlQrCode], ['urlConsultaChave', profile.urlConsultaChave]]) {
    try {
      const parsed = new URL(text(value));
      if (!['http:', 'https:'].includes(parsed.protocol)) return { ready: false, reason: `${name.toUpperCase()}_INVALIDA` };
    } catch (_) {
      return { ready: false, reason: `${name.toUpperCase()}_INVALIDA` };
    }
  }
  return { ready: true, reason: null };
}

function validateA1Readiness(options) {
  if (!options.userDataDir || !options.safeStorage || !options.deviceId) {
    return { ready: false, reason: 'A1_CONTEXT_AUSENTE' };
  }
  if (!hasStoredFiscalA1Bundle({ userDataDir: options.userDataDir })) {
    return { ready: false, reason: 'A1_AUSENTE' };
  }
  let metadata;
  try {
    metadata = inspectFiscalA1Bundle({
      userDataDir: options.userDataDir,
      safeStorage: options.safeStorage,
      empresaId: options.empresaId,
      deviceId: options.deviceId
    });
  } catch (_) {
    return { ready: false, reason: 'A1_INDISPONIVEL' };
  }
  if (!metadata) return { ready: false, reason: 'A1_AUSENTE' };
  const nowMs = options.now ? Date.parse(String(options.now)) : Date.now();
  if (!Number.isFinite(nowMs)) return { ready: false, reason: 'RELOGIO_INVALIDO' };
  if (metadata.validFrom && Date.parse(metadata.validFrom) > nowMs) return { ready: false, reason: 'A1_AINDA_NAO_VALIDO' };
  if (metadata.validTo && Date.parse(metadata.validTo) <= nowMs) return { ready: false, reason: 'A1_EXPIRADO' };
  return { ready: true, reason: null, metadata };
}

function prepareFiscalMode(input, options = {}) {
  const empresaId = text(input && input.empresaId);
  const saleId = text(input && input.saleId);
  const operationId = text(input && input.operationId);
  const deviceId = text(options.deviceId);
  if (!empresaId || !saleId || !operationId || !deviceId) {
    return { mode: 'LEGACY', reason: 'IDENTIDADE_FISCAL_LOCAL_AUSENTE' };
  }

  const existing = getNfceDocumentBySaleId(empresaId, saleId);
  if (existing) {
    return {
      mode: 'RESUME',
      document: existing,
      fiscalAllocation: {
        leaseId: existing.leaseId,
        deviceId,
        fiscalId: existing.fiscalId,
        operationId: existing.operationId,
        xJust: existing.xJust
      }
    };
  }

  if (getSaleById(empresaId, saleId)) {
    return { mode: 'LEGACY', reason: 'VENDA_EXISTENTE_SEM_DOCUMENTO_FISCAL' };
  }

  const subset = validateCurrentSupportedSubset(input);
  if (!subset.eligible) return { mode: 'LEGACY', reason: subset.reason };

  const profile = getFiscalProfileCache(empresaId);
  const profileCheck = validateProfile(profile);
  if (!profileCheck.ready) return { mode: 'LEGACY', reason: profileCheck.reason };

  const a1 = validateA1Readiness({
    empresaId,
    deviceId,
    userDataDir: options.userDataDir,
    safeStorage: options.safeStorage,
    now: options.now
  });
  if (!a1.ready) return { mode: 'LEGACY', reason: a1.reason };

  const lease = getActiveFiscalNumberLease({
    empresaId,
    deviceId,
    ambiente: 'PRODUCAO',
    modelo: 65,
    serie: profile.serieNfce,
    now: options.now
  });
  if (!lease) return { mode: 'LEGACY', reason: 'LEASE_FISCAL_ATIVO_AUSENTE' };

  return {
    mode: 'FISCAL',
    profile,
    lease,
    fiscalAllocation: {
      leaseId: lease.leaseId,
      deviceId,
      fiscalId: `nfce:${saleId}`,
      operationId: `${operationId}:nfce`,
      xJust: 'Emissão em contingência por indisponibilidade de conexão com a SEFAZ.'
    }
  };
}

function runOfflinePaidSaleFiscalPipeline(input, options = {}) {
  const prepared = prepareFiscalMode(input, options);
  if (prepared.mode === 'LEGACY') {
    return {
      enabled: false,
      reason: prepared.reason,
      saleResult: null,
      document: null,
      danfeReady: false
    };
  }

  const saleResult = registerOfflineSaleAtomic({
    ...input,
    fiscalAllocation: prepared.fiscalAllocation
  });

  const empresaId = text(input.empresaId);
  const saleId = text(input.saleId);
  const deviceId = text(options.deviceId);

  const signed = finalizeNfceContingencySigning({
    empresaId,
    saleId,
    deviceId,
    userDataDir: options.userDataDir,
    safeStorage: options.safeStorage,
    now: options.now
  });

  const qr = finalizeNfceContingencyQrCode({
    empresaId,
    saleId,
    deviceId,
    userDataDir: options.userDataDir,
    safeStorage: options.safeStorage,
    now: options.now
  });

  const danfe = generateDanfeContingencyForSale({ empresaId, saleId });
  const document = getNfceDocumentBySaleId(empresaId, saleId);
  if (!document || document.state !== 'CONTINGENCIA_PENDENTE' || !document.qrCodeText) {
    throw new Error('Pipeline fiscal local não terminou em CONTINGENCIA_PENDENTE com QR persistido.');
  }
  if (!danfe || !danfe.consumer || !danfe.establishment) {
    throw new Error('DANFE de contingência não ficou disponível após geração fiscal local.');
  }

  const fiscalOutbox = ensureFiscalOutboxForPendingNfce({ empresaId, saleId });
  const leaseAfter = getFiscalNumberLeaseById(empresaId, document.leaseId);

  return {
    enabled: true,
    reason: null,
    resumed: prepared.mode === 'RESUME',
    saleResult,
    document,
    signed,
    qr,
    danfeReady: true,
    fiscalOutbox,
    nextLeaseNumber: leaseAfter ? leaseAfter.proximoNumero : null,
    leaseStatus: leaseAfter ? leaseAfter.status : null
  };
}

module.exports = {
  validateCurrentSupportedSubset,
  validateProfile,
  validateA1Readiness,
  prepareFiscalMode,
  runOfflinePaidSaleFiscalPipeline
};
