import React from 'react';

export function GlobalLoader() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(255,255,255,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div className="ui active inverted dimmer">
        <div className="ui large text loader">
          Loading...
        </div>
      </div>
    </div>
  );
}