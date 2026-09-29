'use strict';

function createPrintQueue({
  print,
  log = () => {}
} = {}) {
  let tail =
    Promise.resolve();

  function enqueue(payload) {
    const task =
      tail
        .catch(() => {})
        .then(
          () =>
            print(
              payload
            )
        );

    tail =
      task.catch(
        (error) => {
          log(
            'ERRO',
            error
          );
        }
      );

    return task;
  }

  return Object.freeze({
    enqueue
  });
}

module.exports = {
  createPrintQueue
};
