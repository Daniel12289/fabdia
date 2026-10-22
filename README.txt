FABDIA MEDIA - deploy folder

1. Upload every file in this folder to your Vercel project (keep the icons folder).
   Upload the files INSIDE the folder, so index.html sits at the top next to
   app.js and styles.css. All links are relative, so the design also works if
   the files end up in a sub-folder or you open index.html from your phone.

2. The address must be https://fabdia.vercel.app. The backend only accepts
   requests from that address. If you ever change it, the backend, index.html,
   sitemap.xml and robots.txt all need the new address.

3. Install on a phone:
   Android (Chrome): tap the Install app button in Fabdia, or menu > Install app.
   iPhone (Safari): Share button > Add to Home Screen.

4. Google search:
   a. Go to search.google.com/search-console and add https://fabdia.vercel.app
   b. Verify it with the HTML tag method (paste the meta tag inside <head> in index.html, then redeploy).
   c. Sitemaps > submit sitemap.xml
   d. URL Inspection > paste the address > Request indexing
   Google decides when to list a site. Expect days, sometimes weeks.

5. Files
   index.html            page, search titles, sharing previews
   styles.css            design
   app.js                the app
   sw.js                 offline support
   manifest.webmanifest  install-as-app settings
   vercel.json           shows a 404 if someone opens app.js or styles.css directly
   404.html              the 404 page
   robots.txt, sitemap.xml   for Google
   favicon.ico, icons/   app icons and the sharing image
