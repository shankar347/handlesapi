const success = (res, { message = 'Operation completed successfully', data = {}, pagination = null, statusCode = 200 } = {}) =>
  res.status(statusCode).json({
    success: true,
    message,
    data,
    pagination,
  });

const failure = (res, { message = 'Request failed', statusCode = 400, data = null } = {}) =>
  res.status(statusCode).json({
    success: false,
    message,
    data,
    pagination: null,
  });

module.exports = {
  success,
  failure,
};
