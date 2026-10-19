import { Alert, Text, View } from "react-native";
import { colors, type } from "../../theme";
import { Avatar, Button, Card, Chip, KeyValue, ListRow, Notice, Row, Screen, SectionTitle } from "../../components/ui";
import { selectRole, useAuthStore } from "../../store/authStore";
import { missingConfig } from "../../config";

/**
 * "More" tab: who is signed in, role-specific shortcuts, sign out.
 * `links` = [{ icon, title, subtitle, screen, params }] from the role navigator.
 */
export default function AccountScreen({ navigation, route }) {
  const user = useAuthStore((state) => state.user);
  const userInfo = useAuthStore((state) => state.userInfo);
  const role = useAuthStore(selectRole);
  const signOut = useAuthStore((state) => state.signOut);
  const links = route?.params?.links || [];
  const missing = missingConfig();

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "You will need to sign in with Google or Microsoft again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => signOut() },
    ]);

  return (
    <Screen>
      <Card style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
        <Avatar name={user?.email || "?"} size={64} />
        <Text style={type.heading}>{user?.email || "Signed in"}</Text>
        <Row>
          <Chip label={{ admin: "HR admin", employee: "Employee", candidate: "Candidate" }[role]} tone={role === "admin" ? "lime" : "progress"} />
          {userInfo?.stage ? <Chip label={userInfo.stage} tone="neutral" /> : null}
        </Row>
      </Card>

      {missing.length ? (
        <Notice tone="closed" icon="key-outline" title="App keys missing" message={`Requests will fail until ${missing.join(" and ")} are set in .env.`} />
      ) : null}

      {links.length ? (
        <View style={{ gap: 10 }}>
          <SectionTitle title="Shortcuts" />
          {links.map((link) => (
            <ListRow key={link.title} icon={link.icon} title={link.title} subtitle={link.subtitle} onPress={() => navigation.navigate(link.screen, link.params)} />
          ))}
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionTitle title="Account details" />
        <Card>
          <KeyValue label="Email" value={user?.email} />
          <KeyValue label="Record ID" value={userInfo?.id} />
          <KeyValue label="Type" value={userInfo?.subject_type} />
          <KeyValue label="Stage" value={userInfo?.stage} />
          <KeyValue label="Phase" value={userInfo?.phase} />
          <KeyValue label="Status" value={userInfo?.status} last />
        </Card>
      </View>

      <Button title="Sign out" icon="log-out-outline" variant="outline" full onPress={confirmSignOut} style={{ borderColor: colors.destructive }} />
      <Text style={[type.small, { textAlign: "center" }]}>HRCRM mobile · same data as app.hrcrm.ai</Text>
    </Screen>
  );
}
