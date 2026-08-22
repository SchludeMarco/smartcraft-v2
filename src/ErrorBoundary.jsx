import React from 'react';
import { queueErrorReport } from './errorReporting';

class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unerwarteter Fehler in der App:', error, info);
    queueErrorReport('react-error-boundary', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex justify-center items-center bg-gray-800 p-6">
          <div className="text-white p-6 bg-red-600 rounded-xl max-w-sm text-center shadow-2xl">
            <p className="font-bold text-lg mb-2">Etwas ist schiefgelaufen</p>
            <p className="text-sm mb-4">
              Die App ist auf einen unerwarteten Fehler gestoßen. Bitte lade die Seite neu.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-white text-red-600 font-semibold rounded-lg hover:bg-gray-100 transition"
            >
              Seite neu laden
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
