import Feed from "../../components/Feed";
import "./Following.css";
export default function Following() {
  return (
    <Feed
      title="From your circle."
      description="The latest from authors you follow."
      view="following"
    />
  );
}
