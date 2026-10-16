import Feed from "../../components/Feed";
import "./Search.css";
export default function Search() {
  return (
    <Feed
      title="Find your next perspective."
      description="Search publications, people, topics and tags."
      sort="relevance"
    />
  );
}
