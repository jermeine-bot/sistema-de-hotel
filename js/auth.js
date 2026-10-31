/* ============================================================
   auth.js — Login simple (un solo usuario admin)
   ============================================================ */

const Auth = (() => {

  function login(usuario, password) {
    const users = DB.get('usuarios');
    const u = users.find(x => x.usuario === usuario && x.password === password && x.activo);
    if (!u) return { ok: false, error: 'Usuario o contraseña incorrectos' };

    DB.setSession(u);
    DB.update('usuarios', u.id, { ultimoAcceso: Utils.nowISO() });
    return { ok: true, user: u };
  }

  function logout() {
    DB.clearSession();
  }

  function isLogged() {
    return !!DB.getSession();
  }

  function currentUser() {
    return DB.getSession();
  }

  function changePassword(oldPass, newPass) {
    const user = DB.getSession();
    if (!user) return { ok: false, error: 'No hay sesión' };
    const u = DB.get('usuarios').find(x => x.id === user.id);
    if (!u) return { ok: false, error: 'Usuario no encontrado' };
    if (u.password !== oldPass) return { ok: false, error: 'Contraseña actual incorrecta' };
    if (!newPass || newPass.length < 4) return { ok: false, error: 'La nueva contraseña debe tener al menos 4 caracteres' };
    DB.update('usuarios', u.id, { password: newPass });
    return { ok: true };
  }

  return { login, logout, isLogged, currentUser, changePassword };
})();
