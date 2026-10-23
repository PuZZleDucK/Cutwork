import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';
import './workbench.css';
const root = document.getElementById('root');
if (!root) throw new Error('Studio root is missing');
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
