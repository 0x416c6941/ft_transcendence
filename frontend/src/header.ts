// src/ui/header.ts
import { auth } from "./auth.js";
import Router from "./router.js";

export function mountHeader(router: Router) {
  const $login = document.getElementById("btn-login");
  const $register = document.getElementById("btn-register");
  const $profile = document.getElementById("btn-profile");
  const $logout = document.getElementById("btn-logout") as HTMLButtonElement | null;

  if (!$login || !$register || !$profile || !$logout) return;

  const render = () => {
    const loggedIn = auth.isAuthed();
    $login.hidden = loggedIn;
    $register.hidden = loggedIn;
    $profile.hidden = !loggedIn;
    $logout.hidden = !loggedIn;
  };

  render();
  auth.subscribe(render);

  $logout.addEventListener("click", async () => {
    $logout.disabled = true;
    $logout.textContent = "Logging out…";
    await auth.signOut();
    $logout.disabled = false;
    $logout.textContent = "Logout";
    router.navigate("/login");
  });
}
