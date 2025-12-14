# Deploying & Updating Your Stock Screener

This guide explains how to host your screener for free on GitHub Pages and how to keep it updated with fresh data every week.

## 1. Initial Deployment (One-Time Setup)

1.  **Create a GitHub Repository**:
    *   Go to [github.com/new](https://github.com/new).
    *   Name it (e.g., `stock-screener`).
    *   Make it **Public** (required for free Pages) or Private (if you have Pro).
    *   Click **Create repository**.

2.  **Push Your Code**:
    Open a terminal (cmd) in your project folder (`C:\Users\riper\Documents\Stock Screener`) and run:
    ```bash
    git init
    git add .
    git commit -m "Initial commit"
    git branch -M main
    git remote add origin https://github.com/riperdy-tech/stock-screener.git
    git push -u origin main
    ```

3.  **Deploy Configuration (Already Done Locally)**:
    *   I have configured `next.config.js` for you.
    *   I have created a `.github/workflows/deploy.yml` file.
    *   **Action Required**: You just need to push these changes (Steps below).
    *   Once pushed, go to your Repository -> **Settings** -> **Pages**.
    *   Ensure source is set to **GitHub Actions** (if not already selecting it).

4.  **Accessing the Site**:
    *   After you push, wait about 1-2 minutes.
    *   Your website will look like: `https://riperdy-tech.github.io/stock-screener/`
    *   **Send this link to your friend!**

## 2. Weekly Update Workflow

Since you are running the scanner manually on your computer, you need to "push" the new data to GitHub for your friends to see it.

**Every Week:**

1.  **Run the Scanner**:
    *   Double-click `run_scanner.bat`.
    *   Wait for it to finish.
    *   This updates `public/data/stocks.csv` on your computer.

2.  **Publish the Update**:
    *   Open your terminal/command prompt in the folder.
    *   Run these 3 commands:
    ```bash
    git add public/data/stocks.csv
    git commit -m "Weekly data update"
    git push
    ```

3.  **Done!**
    *   GitHub will automatically detect the change, rebuild your site, and update the live URL within 1-2 minutes.
    *   Your friends can just refresh the page.

## Troubleshooting
*   **"File Locked" Error**: Make sure `stocks.csv` is NOT open in Excel when you run the scanner.
*   **Ctrl+C**: To stop the scanner, click the window and press `Ctrl+C`.
