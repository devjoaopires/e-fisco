'use strict';

function createWindowsPrintDriver({
  fs,
  path,
  crypto,
  spawn,
  printerName,
  helperPath,
  tempDir,
  log = () => {},
  now = () => Date.now()
} = {}) {
  function validatePayload(payload) {
    if (
      !payload ||
      typeof payload !== 'object'
    ) {
      throw new Error(
        'Payload de impressÃ£o invÃ¡lido.'
      );
    }

    const origem =
      String(
        payload.origem || 'NFCE'
      ).slice(0, 80);

    const saleId =
      String(
        payload.saleId || ''
      ).slice(0, 120);

    if (
      payload.nativeReceipt &&
      typeof payload.nativeReceipt ===
        'object' &&
      !Array.isArray(
        payload.nativeReceipt
      )
    ) {
      const json =
        JSON.stringify(
          payload.nativeReceipt
        );

      if (
        !json ||
        json.length >
          2 * 1024 * 1024
      ) {
        throw new Error(
          'Dados estruturados do cupom excederam o limite permitido.'
        );
      }

      return {
        mode:
          'NATIVE_TEXT_QR',
        extension: 'json',
        buffer:
          Buffer.from(
            json,
            'utf8'
          ),
        origem,
        saleId
      };
    }

    const imageBase64 =
      String(
        payload.imageBase64 || ''
      );

    const match =
      imageBase64.match(
        /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=\r\n]+)$/i
      );

    if (!match) {
      throw new Error(
        'Payload sem recibo estruturado e sem imagem base64 vÃ¡lida.'
      );
    }

    const base64 =
      match[2].replace(
        /\s/g,
        ''
      );

    if (
      base64.length >
        16 * 1024 * 1024
    ) {
      throw new Error(
        'Imagem do cupom excedeu o limite permitido.'
      );
    }

    return {
      mode:
        'IMAGE_FALLBACK',
      extension:
        match[1]
          .toLowerCase() ===
          'png'
          ? 'png'
          : 'jpg',
      buffer:
        Buffer.from(
          base64,
          'base64'
        ),
      origem,
      saleId
    };
  }

  function executePowerShell(
    inputPath,
    mode
  ) {
    return new Promise(
      (resolve, reject) => {
        const args = [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          helperPath,
          '-PrinterName',
          printerName,
          mode ===
            'NATIVE_TEXT_QR'
            ? '-DataPath'
            : '-ImagePath',
          inputPath
        ];

        const child =
          spawn(
            'powershell.exe',
            args,
            {
              windowsHide: true,
              stdio: [
                'ignore',
                'pipe',
                'pipe'
              ]
            }
          );

        let stdout = '';
        let stderr = '';

        child.stdout.on(
          'data',
          (chunk) => {
            stdout +=
              String(chunk);
          }
        );

        child.stderr.on(
          'data',
          (chunk) => {
            stderr +=
              String(chunk);
          }
        );

        child.on(
          'error',
          reject
        );

        child.on(
          'close',
          (code) => {
            if (code === 0) {
              resolve(
                stdout.trim()
              );
              return;
            }

            reject(
              new Error(
                stderr.trim() ||
                stdout.trim() ||
                `PowerShell encerrou com cÃ³digo ${code}.`
              )
            );
          }
        );
      }
    );
  }

  async function print(payload) {
    const validado =
      validatePayload(
        payload
      );

    const nome =
      `e-fisco-nfce-${now()}-${crypto.randomBytes(4).toString('hex')}.${validado.extension}`;

    const inputPath =
      path.join(
        tempDir,
        nome
      );

    fs.writeFileSync(
      inputPath,
      validado.buffer
    );

    try {
      log(
        'INICIO',
        {
          printer:
            printerName,
          origem:
            validado.origem,
          saleId:
            validado.saleId,
          modo:
            validado.mode,
          bytesEntrada:
            validado.buffer.length
        }
      );

      const retorno =
        await executePowerShell(
          inputPath,
          validado.mode
        );

      log(
        'OK',
        retorno
      );

      return {
        ok: true,
        mode:
          validado.mode ===
            'NATIVE_TEXT_QR'
            ? 'WINDOWS_DRIVER_NATIVE_TEXT_QR'
            : 'WINDOWS_DRIVER_SILENT_IMAGE',
        printer:
          printerName,
        detail:
          retorno
      };
    } finally {
      try {
        fs.unlinkSync(
          inputPath
        );
      } catch (_) {}
    }
  }

  return Object.freeze({
    validatePayload,
    executePowerShell,
    print
  });
}

module.exports = {
  createWindowsPrintDriver
};
