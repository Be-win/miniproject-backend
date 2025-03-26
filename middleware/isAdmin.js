module.exports = function isAdmin(req, res, next) {
    if (req.user && req.user.id === 1) {
        next();
    } else {
        res.status(403).json({ error: 'Forbidden - Admin access required' });
    }
};