import { createRoot } from 'react-dom/client';
import './ui/theme.css';
import { HostApp } from './screens/HostApp';
import { ControllerApp } from './screens/ControllerApp';
import { DevApp } from './screens/DevApp';

const path = location.pathname.replace(/\/+$/, '');
const root = createRoot(document.getElementById('root')!);

if (path === '/host') root.render(<HostApp />);
else if (path === '/dev') root.render(<DevApp />);
else root.render(<ControllerApp />);
