'widget'; // <- required directive at the top

import { Text, VStack, HStack, Spacer, Button } from '@expo/ui/swift-ui';
import { font, foregroundColor, padding, background, cornerRadius, frame, containerBackground, buttonStyle, controlSize, tint } from '@expo/ui/swift-ui/modifiers';
import { createWidget, createLiveActivity } from 'expo-widgets';

function MyWidgetView(props) {
  'widget'; // also required inside the function

  const isAdmin = props?.isAdmin ?? false;
  const isConnected = props?.isConnected ?? false;
  const isChannelActive = props?.isChannelActive ?? false;
  const isGlobalMuteActive = props?.isGlobalMuteActive ?? false;
  const isMuted = props?.isMuted ?? false;
  const activeChannelName = props?.activeChannelName ?? "Voice Room";

  return (
    <VStack
      alignment="leading"
      spacing={5}
      modifiers={[
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
        padding({ all: 14 }),
        containerBackground('#1A1E21', 'widget'),
      ]}
    >
      {/* Header Stack */}
      <VStack alignment="leading" spacing={1}>
        <Text
          modifiers={[
            font({ size: 13, weight: 'bold' }),
            foregroundColor('#B99A4A'),
          ]}
        >
          GoMusafir Voice
        </Text>
        <Text
          modifiers={[
            font({ size: 10, weight: 'semibold' }),
            foregroundColor(isConnected ? '#30D158' : (isChannelActive ? '#34C759' : '#8E8E93')),
          ]}
        >
          {isConnected ? "Connected" : (isChannelActive ? "Active" : "Offline")}
        </Text>
      </VStack>

      <Text
        modifiers={[
          font({ size: 11, weight: 'semibold' }),
          foregroundColor('#E5E5EA'),
        ]}
      >
        {activeChannelName}
      </Text>

      {isAdmin ? (
        // Admin controls
        <VStack spacing={4}>
          <Button
            label={isGlobalMuteActive ? "Unmute Channel" : "Mute Channel"}
            target="mute_channel"
            onPress={() => {
              return { ...props, isGlobalMuteActive: !isGlobalMuteActive };
            }}
            modifiers={[
              buttonStyle('bordered'),
              controlSize('small'),
              tint(isGlobalMuteActive ? '#FF9F0A' : '#AEAEB2'),
            ]}
          />
          <Button
            label="Stop Channel"
            target="stop_channel"
            role="destructive"
            onPress={() => {
              return { ...props, isChannelActive: false, isConnected: false };
            }}
            modifiers={[
              buttonStyle('borderedProminent'),
              controlSize('small'),
              tint('#FF3B30'),
            ]}
          />
        </VStack>
      ) : (
        // Participant controls
        <VStack spacing={4}>
          {!isConnected ? (
            // Not joined
            <VStack spacing={4}>
              <Text
                modifiers={[
                  font({ size: 10 }),
                  foregroundColor('#AEAEB2'),
                ]}
              >
                {isChannelActive ? "Voice channel is active" : "Voice channel is offline"}
              </Text>
              {isChannelActive && (
                <Button
                  label="Join Channel"
                  target="join_channel"
                  onPress={() => {
                    return { ...props, isConnected: true };
                  }}
                  modifiers={[
                    buttonStyle('borderedProminent'),
                    controlSize('small'),
                    tint('#34C759'),
                  ]}
                />
              )}
            </VStack>
          ) : (
            // Joined controls
            <VStack spacing={4}>
              <HStack spacing={4}>
                <Button
                  label={isMuted ? "Tap to Talk" : "Talking..."}
                  target="hold_to_talk"
                  onPress={() => {
                    return { ...props, isMuted: !isMuted };
                  }}
                  modifiers={[
                    buttonStyle(isMuted ? 'bordered' : 'borderedProminent'),
                    controlSize('small'),
                    tint(isMuted ? '#AEAEB2' : '#30D158'),
                  ]}
                />
                <Button
                  label={isMuted ? "Unmute" : "Mute"}
                  target="mute_myself"
                  onPress={() => {
                    return { ...props, isMuted: !isMuted };
                  }}
                  modifiers={[
                    buttonStyle('bordered'),
                    controlSize('small'),
                    tint(isMuted ? '#FF453A' : '#34C759'),
                  ]}
                />
              </HStack>
              <Button
                label="Leave Channel"
                target="leave_channel"
                role="destructive"
                onPress={() => {
                  return { ...props, isConnected: false };
                }}
                modifiers={[
                  buttonStyle('bordered'),
                  controlSize('small'),
                  tint('#FF3B30'),
                ]}
              />
            </VStack>
          )}
        </VStack>
      )}
    </VStack>
  );
}

export const MyWidget = createWidget('MyWidget', MyWidgetView);

function MyLiveActivityView(props) {
  'widget';

  const tripName = props?.tripName ?? "Trip Voice Room";
  const status = props?.status ?? "Voice Live";
  const startTime = props?.startTime ?? Date.now();
  const isAdmin = props?.isAdmin ?? false;

  // For the timer, we count up from startTime (default to now)
  const lowerDate = new Date(startTime);
  const upperDate = new Date(startTime + 12 * 60 * 60 * 1000); // 12 hours limit

  const timerInterval = {
    lower: lowerDate,
    upper: upperDate
  };

  const bannerLayout = (
    <HStack
      alignment="center"
      spacing={10}
      modifiers={[
        padding({ horizontal: 14, vertical: 10 }),
        background('#1A1E21'),
      ]}
    >
      <VStack alignment="leading" spacing={2}>
        <HStack spacing={6} alignment="center">
          <Text
            modifiers={[
              font({ size: 13, weight: 'bold' }),
              foregroundColor('#B99A4A'),
            ]}
          >
            {tripName}
          </Text>
          <Text
            modifiers={[
              font({ size: 9, weight: 'semibold' }),
              foregroundColor('#30D158'),
              padding({ horizontal: 5, vertical: 1 }),
              background('#30D1581A'),
              cornerRadius(4),
            ]}
          >
            {status}
          </Text>
        </HStack>

        {/* Live Timer */}
        <Text
          timerInterval={timerInterval}
          countsDown={false}
          modifiers={[
            font({ size: 18, weight: 'bold' }),
            foregroundColor('#FFF'),
          ]}
        />
      </VStack>

      <Spacer />

      {/* Stop Channel Button for Admin, otherwise empty */}
      {isAdmin && (
        <Button
          label="Stop"
          target="stop_channel"
          role="destructive"
          onPress={() => {
            return { ...props, isChannelActive: false };
          }}
          modifiers={[
            buttonStyle('borderedProminent'),
            controlSize('small'),
            tint('#FF3B30'),
            cornerRadius(10),
          ]}
        />
      )}
    </HStack>
  );

  return {
    banner: bannerLayout,
    compactLeading: (
      <Text
        modifiers={[
          font({ size: 12, weight: 'bold' }),
          foregroundColor('#B99A4A'),
        ]}
      >
        Live
      </Text>
    ),
    compactTrailing: (
      <Text
        timerInterval={timerInterval}
        countsDown={false}
        modifiers={[
          font({ size: 12, weight: 'semibold' }),
          foregroundColor('#30D158'),
        ]}
      />
    ),
    minimal: (
      <Text
        modifiers={[
          font({ size: 12 }),
          foregroundColor('#B99A4A'),
        ]}
      >
        🎙️
      </Text>
    ),
    expandedLeading: (
      <Text
        modifiers={[
          font({ size: 12, weight: 'bold' }),
          foregroundColor('#B99A4A'),
        ]}
      >
        GoMusafir
      </Text>
    ),
    expandedTrailing: (
      <Text
        modifiers={[
          font({ size: 10, weight: 'semibold' }),
          foregroundColor('#30D158'),
        ]}
      >
        {status}
      </Text>
    ),
    expandedCenter: (
      <Text
        modifiers={[
          font({ size: 14, weight: 'semibold' }),
          foregroundColor('#FFF'),
        ]}
      >
        {tripName}
      </Text>
    ),
    expandedBottom: (
      <HStack alignment="center">
        <Text
          timerInterval={timerInterval}
          countsDown={false}
          modifiers={[
            font({ size: 22, weight: 'bold' }),
            foregroundColor('#FFF'),
          ]}
        />
        <Spacer />
        {isAdmin && (
          <Button
            label="Stop Channel"
            target="stop_channel"
            role="destructive"
            onPress={() => {
              return { ...props, isChannelActive: false };
            }}
            modifiers={[
              buttonStyle('borderedProminent'),
              controlSize('small'),
              tint('#FF3B30'),
            ]}
          />
        )}
      </HStack>
    ),
  };
}

export const MyLiveActivity = createLiveActivity('MyLiveActivity', MyLiveActivityView);