interface PaymentIndicatorProps {
  status: 'idle' | 'pending' | 'confirming' | 'confirmed' | 'failed';
}

export const PaymentIndicator = ({ status }: PaymentIndicatorProps) => {
  if (status === 'idle') return null;

  return (
    <div className="border-t bg-yellow-50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        {status === 'pending' && (
          <>
            <span className="animate-spin">⏳</span>
            <span className="text-yellow-800">Waiting for payment approval...</span>
          </>
        )}
        {status === 'confirming' && (
          <>
            <span className="animate-pulse">✓</span>
            <span className="text-blue-800">Payment confirmed, sending message...</span>
          </>
        )}
        {status === 'failed' && (
          <>
            <span>❌</span>
            <span className="text-red-800">Payment failed. Please try again.</span>
          </>
        )}
      </div>
    </div>
  );
};
