# Contributing to discord-vc-tracker

First off — **thank you for taking the time to contribute!** 🙌

`discord-vc-tracker` is a production-ready, TypeScript-first library for tracking Discord voice activity, XP, and statistics. Contributions of all kinds are welcome: bug reports, feature ideas, documentation improvements, and code.

---

## 📌 Table of Contents

* Code of Conduct
* How Can I Contribute?

  * Reporting Bugs
  * Suggesting Features
  * Improving Documentation
  * Contributing Code
* Development Setup
* Project Structure
* Coding Standards
* Commit Guidelines
* Pull Request Process
* Versioning
* Getting Help

---

## 📜 Code of Conduct

This project follows a simple rule: **be respectful and constructive**.

Harassment, discrimination, or abusive behavior will not be tolerated. Treat others how you’d want to be treated in an open-source community.

---

## 🤝 How Can I Contribute?

### 🐛 Reporting Bugs

Before opening an issue:

* ✅ Make sure you’re using the **latest version**
* ✅ Check existing issues to avoid duplicates

When opening a bug report, please include:

* A clear and descriptive title
* Steps to reproduce the issue
* Expected behavior vs actual behavior
* Node.js version
* discord.js version
* Package version (`discord-vc-tracker`)
* Relevant logs or stack traces

---

### 💡 Suggesting Features

Feature requests are welcome!

Please include:

* The problem you’re trying to solve
* Your proposed solution or API design (if any)
* Example use cases
* Whether this is a breaking change

💡 Tip: Features that align with **performance, flexibility, and scalability** are most likely to be accepted.

---

### 📖 Improving Documentation

Documentation contributions are **extremely valuable**.

You can help by:

* Fixing typos or grammar
* Clarifying confusing sections
* Adding examples or diagrams
* Improving README, or examples

No code changes required — docs-only PRs are welcome 👍

---

### 💻 Contributing Code

Code contributions should:

* Follow the existing architecture
* Be TypeScript-first
* Avoid unnecessary breaking changes
* Include clear comments for complex logic

If you’re unsure about a change, open an issue first to discuss it.

---

## 🛠 Development Setup

### Prerequisites

* Node.js **18+**
* npm **9+**
* Git

### Setup Steps

```bash
git clone https://github.com/Instinzts/discord-vc-tracker.git
cd discord-vc-tracker
npm install
```

### Environment Variables

Create a `.env` file for local testing (do **NOT** commit this file):

```env
DISCORD_BOT_TOKEN=your_bot_token_here
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=voicetracker
USE_MONGODB=false
```

---

## ▶️ Useful Scripts

```bash
npm run build      # Compile TypeScript
npm run lint       # Run ESLint
npm run lint:fix   # Auto-fix lint issues
```

Make sure **lint and build pass** before submitting a PR.

---

## 🧱 Project Structure

```text
src/
 ├─ core/        # Core managers and logic
 ├─ storage/     # JSON & MongoDB storage engines
 ├─ types/       # Shared TypeScript types
 ├─ utils/       # Utility helpers
 └─ index.ts     # Public API entry

examples/         # Example bots and integrations
dist/             # Build output (generated)
```

⚠️ Do not manually edit `dist/` — it is generated during build.

---

## 🧑‍💻 Coding Standards

* Written in **TypeScript**
* Prefer `async/await` over raw promises
* Avoid `any` unless absolutely necessary
* Use descriptive variable and method names
* Favor composition over inheritance

### ESLint

This project uses **ESLint v9 (flat config)**.

If ESLint fails locally, ensure:

* `eslint.config.js` exists
* You are using Node.js 18+

---

## 📝 Commit Guidelines

Use clear, descriptive commit messages:

```text
feat: add role-based XP multipliers
fix: prevent duplicate voice sessions
docs: improve MongoDB setup guide
refactor: simplify XP calculation logic
```

Recommended prefixes:

* `feat:` New feature
* `fix:` Bug fix
* `docs:` Documentation only
* `refactor:` Code refactor (no behavior change)
* `chore:` Maintenance / tooling

---

## 🔀 Pull Request Process

1. Fork the repository
2. Create a feature branch:

   ```bash
   git checkout -b feature/my-awesome-feature
   ```
3. Make your changes
4. Run:

   ```bash
   npm run lint
   npm run build
   ```
5. Commit your changes
6. Push to your fork
7. Open a Pull Request against `main`

### PR Requirements

* ✅ Clear description of changes
* ✅ No breaking changes (unless discussed)
* ✅ Lint and build pass
* ✅ Relevant documentation updated

---

## 📦 Versioning

This project follows **Semantic Versioning (SemVer)**:

* **MAJOR** — Breaking changes
* **MINOR** — New features (backward compatible)
* **PATCH** — Bug fixes

Versioning is handled by the maintainer.

---

## 🆘 Getting Help

If you’re stuck or unsure:

* Open an issue with your question
* Provide context and what you’ve tried

We’re happy to help — don’t hesitate to ask 🙂

---

## 🙏 Thank You

Your contributions help make `discord-vc-tracker` better for everyone.

If you enjoy the project:

* ⭐ Star it on GitHub
* 📣 Share it with others
* 🛠 Contribute back

**Made with ❤️ by Async**
