import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png?url";
import markerIconRetina from "leaflet/dist/images/marker-icon-2x.png?url";
import markerShadow from "leaflet/dist/images/marker-shadow.png?url";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIconRetina,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export default L;
