export function NativeMap(props: {
  legs: {
    name: string;
    pickLat: number;
    pickLng: number;
    dropLat: number;
    dropLng: number;
    facilityFrom: string;
    facilityTo: string;
  }[];
  initialRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  allCoords: { latitude: number; longitude: number }[];
}): JSX.Element;
