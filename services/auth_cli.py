"""Bootstrap the first administrator without putting credentials in shell history."""

import getpass

from services import auth


def main() -> None:
    auth.init_db()
    if auth.admin_exists():
        raise SystemExit("Ya existe un administrador activo; no se creó otra cuenta.")

    print("Crear la cuenta inicial de administrador de Nexera")
    username = input("Usuario (3–40 caracteres): ").strip()
    password = getpass.getpass("Contraseña (mínimo 12 caracteres): ")
    confirmation = getpass.getpass("Repite la contraseña: ")
    if password != confirmation:
        raise SystemExit("Las contraseñas no coinciden; no se creó la cuenta.")
    try:
        account = auth.create_user(username, password, "admin")
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    print(f"Administrador {account['username']} creado. Inicia sesión en Nexera y crea la cuenta de usuario desde Administración.")


if __name__ == "__main__":
    main()
