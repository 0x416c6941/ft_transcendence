// src/ui/header.ts
import { auth } from "./auth.js";
import Router from "./router.js";
import ChatPanel from "./components/ChatPanel.js";

let chatPanel: ChatPanel | null = null;

export function mountHeader(router: Router) {
  const $login = document.getElementById("btn-login");
  const $register = document.getElementById("btn-register");
  const $profile = document.getElementById("btn-profile");
  const $friends = document.getElementById("btn-friends");
  const $stats = document.getElementById("btn-stats");
  const $chat = document.getElementById("btn-chat") as HTMLButtonElement | null;
  const $logout = document.getElementById("btn-logout") as HTMLButtonElement | null;

  if (!$login || !$register || !$profile || !$logout || !$friends || !$stats || !$chat) return () => {};

  void auth.bootstrap();

  const render = (s = auth.get()) => {
    const loggedIn = s.status === "authenticated";
    $login.hidden = loggedIn;
    $register.hidden = loggedIn;
    $profile.hidden = !loggedIn;
    $logout.hidden = !loggedIn;
    $friends.hidden = !loggedIn;
    $stats.hidden = !loggedIn;
    
    // Chat button always visible but styled differently
    const chatDisabledLine = document.getElementById('chat-disabled-line');
    if (loggedIn) {
      $chat.classList.remove('opacity-50', 'cursor-not-allowed', 'text-gray-400');
      $chat.classList.add('text-white', 'hover:text-green-400');
      $chat.disabled = false;
      if (chatDisabledLine) chatDisabledLine.style.display = 'none';
    } else {
      $chat.classList.add('opacity-50', 'cursor-not-allowed', 'text-gray-400');
      $chat.classList.remove('text-white', 'hover:text-green-400');
      $chat.disabled = true;
      if (chatDisabledLine) chatDisabledLine.style.display = 'block';
    }

    // Initialize chat panel for authenticated users
    if (loggedIn && !chatPanel) {
      const bodyElement = document.body;
      if (bodyElement) {
        chatPanel = new ChatPanel(router);
        chatPanel.mount(bodyElement);
      }
    } else if (!loggedIn && chatPanel) {
      chatPanel.unmount();
      chatPanel = null;
    }
  };

  // initial paint
  render();

  // keep UI in sync
  const unsubscribe = auth.subscribe(render);

  // nav handlers
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
  $friends.addEventListener("click", (e) => {
    e.preventDefault();
    router.navigate("/friends");
  });
  $stats.addEventListener("click", (e) => {
    e.preventDefault();
    router.navigate("/stats");
  });
  
  // chat toggle
  $chat.addEventListener("click", (e) => {
    e.preventDefault();
    if (!chatPanel) {
      return;
    }
    chatPanel.toggle();
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


  return () => {
    unsubscribe?.();
    $logout.removeEventListener("click", onLogout);
  };
}
