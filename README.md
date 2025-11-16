# Users API

Swagger documentation for the API endpoints is at:
```
https://localhost:${NGINX_HTTPS_PORT}/api/docs
```
(Default port is 1488, configurable in `.env`)

If you're unfimiliar with JWT Authentication, spend 10 minutes and read up on it online, e.g.
```
https://www.jwt.io/introduction#what-is-json-web-token
```

On the client side, any authorized request must carry the token with it (can be saved into a cookie, but be careful to avoid security issues...read up!). Logging user **out** then means simply deleting the token cookie and/or any record of the token from the client side.

Things I've left intentionally `unfinished`:
- **making friends** is not implemented, not even on the DB level; needs new joining table
- **avatar (image)** is not implemented; needs a new field in the USERS table
	1. you can save it as a BLOB in the DB direcly
	2. OR you can just save the image as a uniquely named file, somewhere on the backend, and have just a link to that file as a simple plain STRING field in the DB;
	
	Either way, don't forget that while user input is optional in this case, there should always be a DEFAULT image from the get go, even if user does not upload any avatar image.
- better refer to the specs of USER MGMT. in the subject to make sure all requirements are met
- **2FA** has not been implemented (requirement for the JWT Authentication module!)
- and of course the frontend **views** are missing

The included `tests` are purely as a suggestion. I like adding them since it's they're much more useful than just commenting existing code (comments can lie, tests (='comments' that actually test functionality) do not...they can just be badly written). You can run them from the /backend directory:
```js
.../backend/npm test
```

# ft_transcendence-team-repo

## ROADMAP

### Docker

The app is supposed to be **dockerized**, but this step can easily be done last. All you need is `Node.js` installed on your system; it is already installed at school.

If you want the work with the `SQLite` DB outside of `Node`, you also need to install the database on your system. It's tiny.

### Database - SQLite

If the [documentation](https://sqlite.org/) doesn't help, be sure to check out the first video's first few minutes, which illustrate how to install the DB on a number of systems. It is not necessary, you can simply start working with `SQLite` as an `npm` **package**. Most of them already come up with the binary, so as long as you're in `Node.js`, the package will suffice.

You don't have to become an SQL expert, but you should be fine with the basics of the **language**, `SQL (Structured Query Language)`. Simply go through the second course; even just the online notes might suffice. You should be able to `CRUD (create/read/update/delete)` data in the database (tables/rows/columns), and SQL is a must here. We are **not allowed** to use any `ORM (Object-Relational Mapper)`.

### Backend - Node/Fastify

Our server will be written in `Node`, and will use a highly popular and fast library, called `Fastify`. If you're new to it, again, watch a couple of videos (or at least parts of them), and/or take a look at the **example app** on the `scratchpad` branch. Again, you don't have to go super extra deep, but you should know how to:

- create `REST API endpoints` and why
- add `authentication/authorization` to your routes
  - start with `JWT` (Json Web Token)
  - and take a look at `OAuth2` while you're at it
- log pertinent activities happening across your app
  - later on how to take your logs and pass them to dedicated oversight services

### Frontend - VanillaJS/TS

The frontend mustn't use any frameworks or libraries. No problem. It's called `VanillaJS`, it's fast, and once you spend a little time with it, the `Web API` that modern browsers offer will be a joy to use. Besides this, there are two requirements:

- The Frontend has to be written in `TypeScript`, which essentially means enforcing types (which we've been doing since the start at 42, anyway, so no need to worry). Take a look at the documentation, watch a couple of videos, and, before you know it, you will forget that modern JS is gradually starting to look like TypeScript anyway. ;)
- The look of our Frontend has to be managed via `Tailwind CSS` (think CSS with superpowers).

### Socket.IO

There are different strategies to keeping track of multiple things happening at the same time, say a _bunch of people playing a game of **Pong**_, or those same people _chatting in an online group **chat**_ service. Before we get a serious headache, I would suggest starting with the [tried-and-true Socket.IO](https://socket.io/). Socket.IO is straightforward, and yet incredibly robust library of spinng this or that service on the backend, letting clients register to it from the frontend and use the one service collectively as a group. In the documentation, you will even find a ready-made example of setting up a group chat service. Be sure to check it out.

> [!NOTE]
> And...we're close to or around **7 major modules**, yielding us a **100% mark**. Onwards and upwards(?/!) There are slight modifications and substantial updates waiting ahead, such as adding more players, allowing player setup options, adding an AI opponent, adding support for multiple languages, adding accessibility features, 3D modelling features, observability tooling, etc.
