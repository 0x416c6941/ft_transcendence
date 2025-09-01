# ft_transcendence-team-repo

## ROADMAP

### Docker

The app is supposed to be **dockerized**, but this step can easily be done last. All you need is Node.js installed on your system; it is already installed at school.

If you want the work with the `SQLite` DB outside of `Node`, you also need to install the database on your system. It's tiny.

### Database - SQLite

If the [documentation](https://sqlite.org/) doesn't help, be sure to check out the first video's first few minutes, which illustrate how to install the DB on a number of systems. It is not necessary, you can simply start working with `SQLite` as an `npm` **package**. Most of them already come up with the binary, so as long as you're in `Node.js`, the package will suffice.

You don't have to become an SQL expert, but you should be fine with the basics of the **language**, `SQL (Structured Query Language)`. Simply go through the second course; even just the online notes might suffice. You should be able to `CRUD (create/read/update/delete)` data in the database (tables/rows/columns), and SQL is a must here. We are **not allowed** to use any `ORM (Object-Relational Mapper)`.

### Backend - Node/Fastify

Our server will be written in Node, and will user a highly popular and fast library, called `Fastify`. If you're new to it, again, watch a couple of videos (or at least parts of them), and/or take a look at the **example app** on the `scratchpad` branch. Again, you don't have to go super extra deep, but you should know how to:

- create `REST API endpoints` and why
- add `authentication/authorization` to your routes
  - start with `JWT` (Json Web Token)
  - and take a look at `OAuth2` while you're at it
- log pertinent activities happening across your app
  - later on how to take your logs and pass them to dedicated oversight services

### Frontend - VanillaJS/TS

The frontend mustn't use any frameworks or libraries. No problem. It's called `VanillaJS`, it's fast, and once you'll spend a little time with it, the `Web API` that modern browsers offer will be a joy to use. Besides this, there are two requirements:

- The Frontend has to be written in `TypeScript`, which essentially means enforcing types (which we've been doing since the start at 42, anyway, so no need to worry). Take a look at the documentation, watch a couple of videos, and, before you know it, you will forget that modern JS is gradually starting to look like TypeScript anyway. ;)
- The look of our Frontend has to be managed via `Tailwind CSS` (think CSS with superpowers).

### Socket.IO

There are different strategies to keeping track of multiple things happening at the same time, say a _bunch of people playing a game of **Pong**_, or those same people _chatting in an online group **chat**_ service. Before we get a serious headache, I would suggest starting with the [tried-and-true Socket.IO](https://socket.io/). Socket.IO is straightforward, and yet incredibly robust library of spinng this or that service on the backend, letting clients register to it from the frontend, and use the one service collectively as a group. In the documentation, you will even find a ready-made example of setting up a group chat service. Be sure to check it out.

> [!NOTE]
> And...we're close to or around **7 major modules**, yielding us a **100% mark**. Onwards and upwards(?/!) There are slight modifications and substantial modifications waiting ahead, such as adding more players, allowing player setup options, adding an AI opponent, adding support for multiple languages, add accessibility features, 3D modelling features, observability tooling, etc.
