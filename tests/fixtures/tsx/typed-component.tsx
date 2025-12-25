// @complexity UserCard:cyclomatic=3,cognitive=0
interface User {
  id: string;
  name: string;
  avatar?: string;
}

interface UserCardProps {
  user: User;
  showAvatar?: boolean;
}

function UserCard({ user, showAvatar = true }: UserCardProps): JSX.Element {
  return (
    <div className="user-card">
      {showAvatar && user.avatar && <img src={user.avatar} alt={user.name} />}
      <span>{user.name}</span>
    </div>
  );
}
