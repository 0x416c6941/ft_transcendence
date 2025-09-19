import { PathToRegister, Router } from "./router.js";

const divId: string = "app";
const pathsToRoute: PathToRegister[] = [
];

let router: Router | null;

document.addEventListener("DOMContentLoaded", (e) => {
	router = new Router(divId, pathsToRoute);
});