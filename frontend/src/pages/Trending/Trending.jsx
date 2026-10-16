import Feed from "../../components/Feed";
import "./Trending.css";
export default function Trending() {
  return (
    <Feed
      title="Ideas in conversation."
      description="Recent publications, ranked by real engagement and recency."
      sort="trending"
    />
  );
}
