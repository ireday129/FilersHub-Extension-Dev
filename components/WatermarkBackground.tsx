import React from 'react';

export function WatermarkBackground({ text = "FILERSHUB" }: { text?: string }) {
    return (
        <>
            <style>{`
        .fh-watermark {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-12deg);
          font-size: 20vw;
          font-weight: 900;
          color: #000;
          opacity: 0.03;
          white-space: nowrap;
          pointer-events: none;
          z-index: 0;
          text-transform: uppercase;
          letter-spacing: -0.05em;
        }

        @media (max-width: 768px) {
          .fh-watermark {
            font-size: 30vw;
          }
        }
      `}</style>
            <div className="fh-watermark">{text}</div>
        </>
    );
}
