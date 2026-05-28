const ROLES = {
  ADMINISTRATOR: 'administrator',
  KEPALA_LABORATORIUM: 'kepala_laboratorium',
  KETUA_PROGRAM_STUDI: 'ketua_program_studi',
  STAF_ADMINISTRASI: 'staf_administrasi',
  STAF_LABORATORIUM: 'staf_laboratorium',
};

const ROLE_LABELS = {
  [ROLES.ADMINISTRATOR]: 'Administrator',
  [ROLES.KEPALA_LABORATORIUM]: 'Kepala Laboratorium',
  [ROLES.KETUA_PROGRAM_STUDI]: 'Ketua Program Studi',
  [ROLES.STAF_ADMINISTRASI]: 'Staf Administrasi',
  [ROLES.STAF_LABORATORIUM]: 'Staf Laboratorium',
};

module.exports = {
  ROLES,
  ROLE_LABELS,
};
