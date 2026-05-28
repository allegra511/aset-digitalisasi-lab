require('dotenv').config({ quiet: true });

const path = require('path');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');

const appConfig = require('./config/app');
const auditRoutes = require('./src/modules/audit/audit.routes');
const authRoutes = require('./src/modules/auth/auth.routes');
const dashboardRoutes = require('./src/modules/dashboard/dashboard.routes');
const assetsRoutes = require('./src/modules/assets/assets.routes');
const consumablesRoutes = require('./src/modules/consumables/consumables.routes');
const maintenanceRoutes = require('./src/modules/maintenance/maintenance.routes');
const procurementRoutes = require('./src/modules/procurement/procurement.routes');
const receivingRoutes = require('./src/modules/receiving/receiving.routes');
const reportsRoutes = require('./src/modules/reports/reports.routes');
const roomsRoutes = require('./src/modules/rooms/rooms.routes');
const usersRoutes = require('./src/modules/users/users.routes');
const { errorHandler, notFound, setLocals } = require('./src/middlewares');

const app = express();

if (appConfig.trustProxy) {
  app.set('trust proxy', 1);
}

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'src', 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    name: appConfig.session.name,
    secret: appConfig.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: appConfig.env === 'production',
      maxAge: appConfig.session.maxAge,
    },
  })
);

app.use(setLocals);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    app: appConfig.name,
    environment: appConfig.env,
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  return res.render('index', {
    title: appConfig.name,
  });
});

app.get('/login', (req, res) => res.redirect('/auth/login'));
app.use('/audit', auditRoutes);
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/assets', assetsRoutes);
app.use('/consumables', consumablesRoutes);
app.use('/maintenance', maintenanceRoutes);
app.use('/procurement', procurementRoutes);
app.use('/receiving', receivingRoutes);
app.use('/reports', reportsRoutes);
app.use('/users', usersRoutes);
app.use('/rooms', roomsRoutes);

app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
  app.listen(appConfig.port, () => {
    console.log(`${appConfig.name} berjalan di http://localhost:${appConfig.port}`);
  });
}

module.exports = app;
