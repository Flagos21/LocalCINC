export function isConnectionRefusedError(err) {
  if (!err) return false;
  if (err.code === 'ECONNREFUSED') return true;
  if (err.cause && err.cause !== err && isConnectionRefusedError(err.cause)) {
    return true;
  }
  if (Array.isArray(err.errors)) {
    return err.errors.some((nested) => nested && nested !== err && isConnectionRefusedError(nested));
  }
  if (typeof err.message === 'string' && err.message.includes('ECONNREFUSED')) {
    return true;
  }
  return false;
}

export default isConnectionRefusedError;
