// src/ui/header.ts
import { auth } from "./auth.js";
import Router from "./router.js";

export function mountHeader(router: Router) {
  const $login = document.getElementById("btn-login");
  const $register = document.getElementById("btn-register");
  const $profile = document.getElementById("btn-profile");
  const $logout = document.getElementById("btn-logout") as HTMLButtonElement | null;

  if (!$login || !$register || !$profile || !$logout) return () => {};

  // ensure auth state is hydrated (no-op if already bootstrapped)
  void auth.bootstrap();

  const render = (s = auth.get()) => {
    const loggedIn = s.status === "authenticated";
    $login.hidden = loggedIn;
    $register.hidden = loggedIn;
    $profile.hidden = !loggedIn;
    $logout.hidden = !loggedIn;
  };

  // initial paint
  render();

  // keep UI in sync
  const unsubscribe = auth.subscribe(render);

  // nav handlers (tiny QoL)
  $login.addEventListener("click", (e) => {
    e.preventDefault();
    router.navigate("/login");
  });
  $register.addEventListener("click", (e) => {
    e.preventDefault();
    router.navigate("/register");
  });
  $profile.addEventListener("click", (e) => {
    e.preventDefault();
    router.navigate("/profile");
  });

  // logout flow
  const onLogout = async (e: Event) => {
    e.preventDefault();
    $logout.disabled = true;
    const prev = $logout.textContent;
    $logout.textContent = "Logging out…";
    try {
      await auth.signOut();
      router.navigate("/login");
    } finally {
      $logout.disabled = false;
      $logout.textContent = prev || "Logout";
    }
  };
  $logout.addEventListener("click", onLogout);

  // optional cleanup for SPA route changes / re-mounts
  return () => {
    unsubscribe?.();
    $logout.removeEventListener("click", onLogout);
  };
}
