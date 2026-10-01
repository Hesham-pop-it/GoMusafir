async function guardedTransaction(reference, change) {
  // A one-off get() does not retain the SDK's transaction cache. A guarded
  // callback can otherwise see a synthetic null and abort without ever reading
  // the existing server record. Hold a value listener until the transaction ends.
  let listener;
  let changeError;
  try {
    await new Promise((resolve, reject) => {
      listener = () => resolve();
      reference.on('value', listener, reject);
    });
    const result = await reference.transaction(current => {
      changeError = undefined;
      try { return change(current); }
      catch (error) { changeError = error; return undefined; }
    });
    if (changeError) throw changeError;
    return result;
  } finally {
    if (listener) reference.off('value', listener);
  }
}

module.exports = { guardedTransaction };
