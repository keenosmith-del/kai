import Feed from "../../components/Feed";
import "./Saved.css";
export default function Saved() {
  return (
    <Feed
      title="Kept for later."
      description="Your saved reading, always here."
      view="saved"
    />
  );
}
