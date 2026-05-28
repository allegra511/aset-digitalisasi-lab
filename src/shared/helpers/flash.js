function addFlash(req, type, message) {
  if (!req.session) {
    return;
  }

  req.session.flash = req.session.flash || [];
  req.session.flash.push({ type, message });
}

function consumeFlash(req) {
  if (!req.session) {
    return [];
  }

  const messages = req.session.flash || [];
  req.session.flash = [];
  return messages;
}

module.exports = {
  addFlash,
  consumeFlash,
};
