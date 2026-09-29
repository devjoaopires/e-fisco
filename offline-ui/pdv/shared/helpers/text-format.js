(function (global) {
  'use strict';

  var root =
    global.__scfPdvShared ||
    (global.__scfPdvShared = {});

  function text(value) {
    return String(
      value == null
        ? ''
        : value
    ).trim();
  }

  function digits(value) {
    return text(value)
      .replace(/\D/g, '');
  }

  function normalizeAsciiUpper(
    value
  ) {
    return text(value)
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .toUpperCase();
  }

  function formatCnpj(value) {
    var cnpj =
      digits(value).slice(0, 14);

    if (cnpj.length !== 14) {
      return text(value);
    }

    return cnpj.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5'
    );
  }

  function formatFiscalEnvironment(
    value
  ) {
    var values =
      root.values &&
      root.values
        .fiscalEnvironment;

    if (!values) {
      throw new Error(
        'PDV shared values indisponíveis.'
      );
    }

    var environment =
      normalizeAsciiUpper(value);

    if (
      environment === '1' ||
      environment ===
        'PRODUCAO' ||
      environment === 'PROD'
    ) {
      return values.production;
    }

    if (
      environment === '2' ||
      environment ===
        'HOMOLOGACAO' ||
      environment === 'HOMOLOG' ||
      environment === 'HOM' ||
      environment === 'HML'
    ) {
      return values.homologation;
    }

    return '';
  }

  function normalizeProfile(value) {
    return normalizeAsciiUpper(value)
      .replace(/[^A-Z]/g, '');
  }

  root.helpers = Object.freeze({
    text: text,
    digits: digits,
    normalizeAsciiUpper:
      normalizeAsciiUpper,
    formatCnpj: formatCnpj,
    formatFiscalEnvironment:
      formatFiscalEnvironment,
    normalizeProfile:
      normalizeProfile
  });
})(window);
