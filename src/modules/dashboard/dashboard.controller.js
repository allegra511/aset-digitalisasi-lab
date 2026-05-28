const { asyncHandler } = require('../../shared/helpers');
const dashboardService = require('./dashboard.service');

const showDashboard = asyncHandler(async (req, res) => {
  const currentUser = req.session.user;
  const dashboard = await dashboardService.getDashboardData(currentUser);

  res.render('dashboard/index', {
    title: dashboard.title,
    dashboard,
  });
});

module.exports = {
  showDashboard,
};
