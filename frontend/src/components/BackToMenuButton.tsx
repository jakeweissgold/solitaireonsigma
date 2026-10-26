import { IconButton } from '@sigmacomputing/phi';
import { useLocation } from 'wouter';

export function BackToMenuButton() {
  const [, navigate] = useLocation();
  return <IconButton icon="ArrowLeft" label="Back to menu" onPress={() => navigate('/')} size="medium" />;
}
