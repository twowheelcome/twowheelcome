import { ScrollViewStyleReset } from 'expo-router/html'
import type { PropsWithChildren } from 'react'

// Web-only file used to configure the root HTML for every web page during
// static rendering. Runs in Node.js — no DOM/browser APIs here.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* PWA — installable, runs fullscreen when added to home screen */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#F2EBDD" />

        {/* iOS — add to home screen, fullscreen standalone */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="TWOWHEELCOME" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        <ScrollViewStyleReset />

        {/* Register the web-push service worker (no-op if unsupported; catch keeps it fail-safe). */}
        <script
          dangerouslySetInnerHTML={{
            __html: "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}",
          }}
        />

        {/* Pre-hydration: paint the body in the right theme so dark-mode users don't
            get a white flash before React mounts (mirrors ThemeContext's resolution). */}
        <style dangerouslySetInnerHTML={{ __html: 'html,body{background:#F7F1E6}' }} />
        <script
          dangerouslySetInnerHTML={{
            __html: "(function(){try{var m=localStorage.getItem('twowheelcome.themeMode');var d=m==='dark'||((m==='system'||!m)&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);var c=d?'#2F3438':'#F7F1E6';document.documentElement.style.background=c;document.body.style.background=c;}catch(e){}})();",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
