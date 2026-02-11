import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Prevent duplicate root creation during hot-reloads in the editor environment
const container = document.getElementById('root');

if (container && !window.__ROOT_CREATED__) {
  window.__ROOT_CREATED__ = true;
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

declare global {
  interface Window {
    __ROOT_CREATED__?: boolean;
  }
}