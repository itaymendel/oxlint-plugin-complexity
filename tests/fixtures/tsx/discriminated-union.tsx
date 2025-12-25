// @complexity StatusBadge:cyclomatic=4,cognitive=1
type Status =
  | { type: 'loading' }
  | { type: 'success'; data: string }
  | { type: 'error'; message: string };

interface StatusBadgeProps {
  status: Status;
}

function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  switch (status.type) {
    case 'loading':
      return <span className="badge loading">Loading...</span>;
    case 'success':
      return <span className="badge success">{status.data}</span>;
    case 'error':
      return <span className="badge error">{status.message}</span>;
    default:
      return <span className="badge">Unknown</span>;
  }
}
