# 💸 SpendGuard

> A smart, privacy-minded expense tracker that helps people understand their spending—one expense at a time.

SpendGuard is a full-stack Progressive Web App for tracking expenses, setting budgets, reviewing spending insights, and keeping financial data available across devices.

**Built by a 14-year-old developer learning to solve real problems with code.**

## 🌐 Live Demo

Try SpendGuard here:  
https://zinogabriel.github.io/expense-traker-1/

## ✨ What makes SpendGuard useful?

- 📊 Track expenses and view spending insights
- 🎯 Set overall and category budget limits
- 📂 Import bank-statement CSV files and export expense history
- 🔎 Detect duplicate CSV entries before importing
- 💱 Choose a country and display expenses in its supported currency
- 💬 Use **Spendy**, a spending assistant for reports and expense logging
- 🎙 Use voice input where the browser supports it
- 🔐 Create an account and keep data synced across devices
- 📱 Install SpendGuard as a Progressive Web App
- 🌙 Switch between light and dark mode
- ⚡ Paste bank-alert SMS text into the manual SMS parser

## 🛠️ Built With

- HTML
- CSS
- JavaScript
- Supabase Authentication
- Supabase Database with Row Level Security
- Chart.js
- Netlify Functions
- Gemini AI for optional spending advice
- GitHub Pages

## 🔒 Privacy and Security

SpendGuard is designed with privacy in mind.

- Passwords are handled by Supabase Authentication.
- Each user can access only their own expense data through Row Level Security.
- The SMS feature is manual: SpendGuard does **not** read a user’s phone SMS inbox.
- AI advice uses spending summaries; users should never enter bank login details.

## 🚀 What I Learned

Building SpendGuard taught me how to:

- Design responsive interfaces for desktop and mobile
- Debug JavaScript errors
- Build sign-up, login, logout, and session flows
- Connect a front end to a cloud database
- Protect user data with database policies
- Handle CSV import/export and validation
- Build charts, budget calculations, and reusable UI features
- Use GitHub Copilot responsibly to troubleshoot and learn

## 🗺️ Roadmap

Features I want to improve next:

- [ ] Recurring payments and subscription reminders
- [ ] Savings goals
- [ ] More spending categories and smarter insights
- [ ] Improved offline experience
- [ ] Better automated tests
- [ ] A proper transaction database table for larger accounts

## 🤝 Feedback Welcome

I am still learning, and I would love feedback from developers, designers, and users.

If you find SpendGuard useful, please consider giving the repository a ⭐ and following my journey on GitHub.

Made with curiosity and persistence by [@ZinoGabriel](https://github.com/zinogabriel)
© 2026 ZinoGabriel. All rights reserved. This project may not be copied, redistributed, or used commercially without permission.
