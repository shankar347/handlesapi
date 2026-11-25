const { success, failure } = require('../utils/apiResponse');
const { createLike, entitlementFor } = require('../services/likeService');

const status = async (req, res, next) => {
  try {
    const entitlement = await entitlementFor(req.user._id);
    return success(res, { message: 'Like status', data: entitlement });
  } catch (error) {
    return next(error);
  }
};

const likeProfile = async (req, res, next) => {
  try {
    const result = await createLike(req.user._id, req.body?.toUserId);
    return success(res, {
      message: result.matched ? 'It is a match' : result.created ? 'Like saved' : 'Like already saved',
      statusCode: result.created ? 201 : 200,
      data: {
        created: result.created,
        matched: result.matched,
        entitlement: result.entitlement,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return failure(res, {
        message: error.message,
        statusCode: error.statusCode,
        data: { code: error.code || null },
      });
    }
    return next(error);
  }
};

module.exports = { status, likeProfile };
