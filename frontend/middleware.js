module.exports = (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  if (req.path === '/login' || req.path === '/register') {
    return next();
  }

  if (req.method === 'POST' && req.path === '/sessions') {
    return next();
  }

  if (req.method === 'POST' && req.path === '/users') {
    return next();
  }

  if (req.method === 'GET' && req.path === '/users') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (req.method === 'GET') {
      if (req.path.startsWith('/listings') || 
          req.path.startsWith('/sessions') ||
          req.path.startsWith('/users/')) {
        return next();
      }
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};
