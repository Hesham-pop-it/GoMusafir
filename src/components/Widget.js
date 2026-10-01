'widget'; // <- required directive at the top

import { Text, VStack, HStack, Spacer, Button, Image, Link, ZStack } from '@expo/ui/swift-ui';
import { font, foregroundColor, padding, background, cornerRadius, frame, containerBackground, buttonStyle, controlSize, tint, shadow, symbolEffect, border, resizable, aspectRatio, clipped, foregroundStyle, widgetURL, clipShape, disabled } from '@expo/ui/swift-ui/modifiers';
import { createWidget, createLiveActivity } from 'expo-widgets';

function MyWidgetView(props) {
  'widget';

  const isAdmin = props?.isAdmin === true || props?.isAdmin === 'true';
  const isConnected = props?.isConnected === true || props?.isConnected === 'true';
  const isMuted = props?.isMuted !== false && props?.isMuted !== 'false';
  const isChannelActive = props?.isChannelActive === true || props?.isChannelActive === 'true';
  const activeChannelName = props?.activeChannelName ?? "Umrah Tour";
  const activeChannelImageURL = props?.activeChannelImageURL ?? null;
  const rawSpeakerName = props?.activeSpeakerName;
  const isSpeaking = (props?.isSpeaking === true || props?.isSpeaking === 'true') && !!rawSpeakerName && rawSpeakerName !== "No Active Speaker" && rawSpeakerName !== "No active speaker";
  const activeSpeakerName = isSpeaking ? rawSpeakerName : "No active speaker";
  const activeSpeakerAvatar = props?.activeSpeakerAvatar ?? null;
  const participantCount = props?.participantCount ?? 0;
  const tripId = props?.tripId ?? null;
  const orgId = props?.orgId ?? null;
  const widgetLogoURL = props?.widgetLogoURL ?? null;

  return (
    <HStack
      alignment="top"
      spacing={6}
      modifiers={[
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'leading' }),
        padding({ horizontal: 4, vertical: 8 }),
        containerBackground('#1A1E21', 'widget'),
      ]}
    >
      {/* Left Column - Photo Card */}
      <VStack
        spacing={0}
        alignment="leading"
        modifiers={[
          frame({ width: 138 }),
          background('#24262A'),
          cornerRadius(14),
          clipped(),
        ]}
      >
        {activeChannelImageURL && activeChannelImageURL !== '' ? (
          <Image
            uiImage={activeChannelImageURL}
            modifiers={[resizable(), aspectRatio({ contentMode: 'fill' }), frame({ width: 138, height: 90 }), clipped()]}
          />
        ) : (
          <VStack alignment="center" modifiers={[frame({ width: 138, height: 90 }), background('#2E3034')]}>
            <Image systemName="photo.fill" modifiers={[font({ size: 22 }), foregroundColor('#CBA052')]} />
          </VStack>
        )}
        <VStack spacing={6} alignment="leading" modifiers={[padding({ all: 8 })]}>
          <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundColor('#FFF')]} lineLimit={1}>
            {activeChannelName}
          </Text>
          <HStack alignment="center" spacing={4}>
            <HStack
              alignment="center"
              spacing={2}
              modifiers={[
                padding({ horizontal: 4, vertical: 3 }),
                background(isChannelActive ? '#243E2E' : '#24262A'),
                cornerRadius(4),
                padding({ all: 0.5 }),
                background(isChannelActive ? '#34513C' : '#383C40'),
                cornerRadius(4.5),
              ]}
            >
              <Text modifiers={[font({ size: 5 }), foregroundColor(isChannelActive ? '#34C759' : '#737B87')]}>●</Text>
              <Text modifiers={[font({ size: 11, weight: 'regular' }), foregroundColor(isChannelActive ? '#34C759' : '#737B87')]}>
              {isChannelActive ? "Online" : "Offline"}
            </Text>
          </HStack>
          <Spacer />
          <HStack spacing={3} alignment="center" modifiers={[padding({ horizontal: 6, vertical: 2 }), background('#2E3034'), cornerRadius(16)]}>
            <Image systemName="person.3" modifiers={[font({ size: 8 }), foregroundColor('#D4AF37')]} />
            <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundColor('#FFF')]}>{participantCount}</Text>
          </HStack>
        </HStack>
      </VStack>
    </VStack>

      {/* Right Column */}
  <VStack spacing={4} alignment="leading" modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
    {widgetLogoURL && widgetLogoURL !== '' ? (
      <Image
        uiImage={widgetLogoURL}
        modifiers={[
          resizable(),
          aspectRatio({ contentMode: 'fit' }),
          frame({ height: 20, alignment: 'leading' }),
        ]}
      />
    ) : (
      <HStack alignment="center" spacing={4}>
        <Image systemName="squareshape.split.2x2" modifiers={[foregroundColor('#D4AF37'), font({ size: 12 })]} />
        <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundColor('#D4AF37')]}>GoMusāfir</Text>
      </HStack>
    )}

    <Spacer />

    <HStack alignment="center" spacing={6}>
        {isSpeaking && <ZStack alignment="center">
          <VStack
            modifiers={[
              frame({ width: 30, height: 30 }),
              background('#30D158'),
              clipShape('circle'),
              shadow({ color: '#30D158', radius: 5 }),
            ]}
          />
          <VStack
            modifiers={[
              frame({ width: 27, height: 27 }),
              background('#24262A'),
              clipShape('circle'),
            ]}
          />
          {activeSpeakerAvatar && activeSpeakerAvatar !== '' ? (
            <Image
              uiImage={activeSpeakerAvatar}
              modifiers={[
                resizable(),
                aspectRatio({ contentMode: 'fill' }),
                frame({ width: 27, height: 27 }),
                clipShape('circle'),
              ]}
            />
          ) : (
            <Text
              modifiers={[
                font({ size: 12, weight: 'bold' }),
                foregroundColor('#FFF'),
              ]}
            >
              {activeSpeakerName && activeSpeakerName[0] ? activeSpeakerName[0].toUpperCase() : 'H'}
            </Text>
          )}
        </ZStack>}
        <VStack spacing={2} alignment="leading" modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
          <Text modifiers={[font({ size: 10 }), foregroundColor('#8E8E93')]} lineLimit={1}>Active speaker:</Text>
          <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundColor('#FFF')]} lineLimit={1}>
            {activeSpeakerName}
          </Text>
        </VStack>
        {isSpeaking && (
          <Image
            systemName="waveform"
            modifiers={[font({ size: 12 }), foregroundColor('#D4AF37')]}
          />
        )}
    </HStack>

    <Spacer />

    {/* Stacked capsule buttons with a thin gold outline. */}
    <VStack spacing={4} modifiers={[frame({ maxWidth: Infinity })]}>
      <Link
        destination={tripId && orgId
          ? `gomusafir://voicechat?tripId=${encodeURIComponent(tripId)}&orgId=${encodeURIComponent(orgId)}&autoStart=true`
          : 'gomusafir://voicechat?autoStart=true'}
        modifiers={[
          frame({ height: 36 }),
          frame({ maxWidth: Infinity }),
        ]}
      >
        <HStack alignment="center" spacing={6} modifiers={[
          frame({ height: 35 }), frame({ maxWidth: Infinity }),
          background('#1A1E21'), cornerRadius(18),
          padding({ all: 0.5 }), background('#B99A4A'), cornerRadius(18),
        ]}>
          <Image systemName={isConnected && isMuted ? "mic.slash.fill" : "mic.fill"} modifiers={[foregroundColor(isConnected && !isMuted ? '#30D158' : '#FFFFFF'), font({ size: 12 })]} />
          <Text modifiers={[foregroundColor('#FFFFFF'), font({ size: 12, weight: 'bold' })]}>Open Voice</Text>
        </HStack>
      </Link>
      <Link
        destination={`gomusafir://livelocation${tripId ? `?tripId=${tripId}&orgId=${orgId}` : ''}`}
        modifiers={[
          frame({ height: 36 }),
          frame({ maxWidth: Infinity }),
        ]}
      >
        <HStack alignment="center" spacing={6} modifiers={[
          frame({ height: 35 }), frame({ maxWidth: Infinity }),
          background('#1A1E21'), cornerRadius(18),
          padding({ all: 0.5 }), background('#B99A4A'), cornerRadius(18),
        ]}>
          <Image systemName="map" modifiers={[foregroundColor('#FFFFFF'), font({ size: 12 })]} />
          <Text modifiers={[foregroundColor('#FFFFFF'), font({ size: 12, weight: 'bold' })]}>Open Map</Text>
        </HStack>
      </Link>
    </VStack>
  </VStack>
    </HStack >
  );
}

export const MyWidget = createWidget('MyWidget', MyWidgetView);

function MyLiveActivityView(props) {
  'widget';

  const startTime = props?.startTime ?? Date.now();
  const isAdmin = props?.isAdmin === true || props?.isAdmin === 'true';
  const isConnected = props?.isConnected === true || props?.isConnected === 'true';
  const isSpeaking = props?.isSpeaking === true || props?.isSpeaking === 'true';
  const isChannelActive = props?.isChannelActive === true || props?.isChannelActive === 'true';
  const isGlobalMuteActive = props?.isGlobalMuteActive === true || props?.isGlobalMuteActive === 'true';
  const isMuted = props?.isMuted === true || props?.isMuted === 'true';
  const activeChannelName = props?.activeChannelName ?? "Voice Room";
  const participantCount = props?.participantCount ?? 0;
  const widgetLogoURL = props?.widgetLogoURL ?? null;

  // Speaker resolution: always show a clean speaker name and avatar/monogram
  const rawSpeakerName = props?.activeSpeakerName;
  const displayName = (isSpeaking && rawSpeakerName && rawSpeakerName.trim() !== '' && rawSpeakerName !== 'No Active Speaker')
    ? rawSpeakerName.trim()
    : 'No Active Speaker';
  const firstName = displayName.split(' ')[0] || displayName;
  const initial = (firstName[0] || 'H').toUpperCase();
  const activeSpeakerAvatar = props?.activeSpeakerAvatar ?? null;

  // For the timer, we count up from startTime (default to now)
  const lowerDate = new Date(startTime);
  const upperDate = new Date(startTime + 12 * 60 * 60 * 1000); // 12 hours limit

  const timerInterval = {
    lower: lowerDate,
    upper: upperDate
  };

  const bannerLayout = (
    <VStack
      alignment="leading"
      spacing={12}
      modifiers={[
        padding({ all: 16 }),
        background('#1A1E21'),
      ]}
    >
      {/* Keep the idle header clear; show an avatar only while someone speaks. */}
      <HStack alignment="center" spacing={10}>
        {isSpeaking && <ZStack alignment="center">
          <VStack
            modifiers={[
              frame({ width: 44, height: 44 }),
              background(isSpeaking ? '#30D158' : '#34C759'),
              clipShape('circle'),
              ...(isSpeaking ? [shadow({ color: '#30D158', radius: 4 })] : []),
            ]}
          />
          <VStack
            modifiers={[
              frame({ width: 40, height: 40 }),
              background('#24262A'),
              clipShape('circle'),
            ]}
          />
          {activeSpeakerAvatar && activeSpeakerAvatar !== '' ? (
            <Image
              uiImage={activeSpeakerAvatar}
              modifiers={[
                frame({ width: 40, height: 40 }),
                resizable(),
                aspectRatio({ contentMode: 'fill' }),
                clipShape('circle'),
              ]}
            />
          ) : (
            <Text
              modifiers={[
                font({ size: 18, weight: 'bold' }),
                foregroundColor('#FFF'),
              ]}
            >
              {initial}
            </Text>
          )}
        </ZStack>}
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 12 }), foregroundColor('#8E8E93')]}>
            Active speaker:
          </Text>
          <Text modifiers={[font({ size: 18, weight: 'bold' }), foregroundColor('#FFF')]}>
            {displayName}
          </Text>
        </VStack>
        <Spacer />
        {widgetLogoURL && widgetLogoURL !== '' ? (
          <Image
            uiImage={widgetLogoURL}
            modifiers={[
              resizable(),
              aspectRatio({ contentMode: 'fit' }),
              frame({ height: 26, alignment: 'trailing' }),
            ]}
          />
        ) : (
          <Image
            systemName="waveform"
            modifiers={[foregroundColor('#D4AF37'), font({ size: 22 })]}
          />
        )}
      </HStack>

      {/* Middle Section: Channel Status & Participants */}
      <HStack
        alignment="center"
        spacing={8}
        modifiers={[
          padding({ horizontal: 12, vertical: 10 }),
          background('#24262A'),
          cornerRadius(12),
        ]}
      >
        <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundColor('#FFF')]}>{activeChannelName}</Text>

        <HStack
          spacing={3}
          alignment="center"
          modifiers={[
            padding({ horizontal: 6, vertical: 3 }),
            background(isChannelActive ? '#243E2E' : '#24262A'),
            cornerRadius(6),
            padding({ all: 0.5 }),
            background(isChannelActive ? '#34513C' : '#383C40'),
            cornerRadius(6.5),
          ]}
        >
          <Text modifiers={[font({ size: 6 }), foregroundColor(isChannelActive ? '#34C759' : '#737B87')]}>●</Text>
          <Text modifiers={[font({ size: 11, weight: 'regular' }), foregroundColor(isChannelActive ? '#34C759' : '#737B87')]}>
            {isChannelActive ? "Online" : "Offline"}
          </Text>
        </HStack>

        <Text modifiers={[font({ size: 12 }), foregroundColor('#4A4C50')]}>|</Text>

        <Text modifiers={[font({ size: 12 }), foregroundColor('#8E8E93')]}>Participants : </Text>
        <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundColor('#FFF')]}>{participantCount}</Text>

        <Spacer />

        <HStack spacing={-6}>
          {participantCount > 0 && <Text modifiers={[font({ size: 16 })]}>👩🏽</Text>}
          {participantCount > 1 && <Text modifiers={[font({ size: 16 })]}>👨🏻</Text>}
          {participantCount > 2 && (
            <Text
              modifiers={[
                font({ size: 9, weight: 'bold' }),
                foregroundColor('#FFF'),
                padding({ all: 4 }),
                background('#4A4C50'),
                cornerRadius(10),
              ]}
            >
              +{participantCount - 2}
            </Text>
          )}
        </HStack>
      </HStack>

      {/* Equal-width pill controls fit the compact lock-screen card. */}
      <HStack spacing={6} alignment="center">
        <Button
          target={isConnected ? (isAdmin ? "stop_channel" : "leave_channel") : "join_channel"}
          onPress={() => props}
          modifiers={[buttonStyle('plain'), frame({ maxWidth: Infinity })]}
        >
          <HStack spacing={5} modifiers={[frame({ maxWidth: Infinity }), frame({ height: 46 }), background('#B99A43'), clipShape('capsule')]}>
            <Image systemName={isConnected ? "phone.down.fill" : "play.circle"} modifiers={[font({ size: 12 }), foregroundColor('#FFF')]} />
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundColor('#FFF')]}>
              {isConnected ? (isAdmin ? "Stop Voice" : "Leave") : "Start Voice"}
            </Text>
          </HStack>
        </Button>
        <Button
          target="mute_myself"
          onPress={() => isConnected ? { ...props, isMuted: !isMuted } : props}
          modifiers={[buttonStyle('plain'), frame({ maxWidth: Infinity }), disabled(!isConnected || (isGlobalMuteActive && !isAdmin))]}
        >
          <HStack spacing={5} modifiers={[frame({ maxWidth: Infinity }), frame({ height: 44 }), background('#202427'), clipShape('capsule'), padding({ all: 1 }), background('#4A525A'), clipShape('capsule')]}>
            <Image systemName={isMuted || !isConnected ? "mic.slash.fill" : "mic.fill"} modifiers={[font({ size: 12 }), foregroundColor(isConnected ? '#FFF' : '#4A525A')]} />
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundColor(isConnected ? '#FFF' : '#4A525A')]}>
              {isConnected && isMuted ? "Unmute" : "Mute Myself"}
            </Text>
          </HStack>
        </Button>
        {isAdmin && <Button
          target="mute_channel"
          onPress={() => isConnected ? { ...props, isGlobalMuteActive: !isGlobalMuteActive } : props}
          modifiers={[buttonStyle('plain'), frame({ maxWidth: Infinity }), disabled(!isConnected)]}
        >
          <HStack spacing={5} modifiers={[frame({ maxWidth: Infinity }), frame({ height: 44 }), background('#202427'), clipShape('capsule'), padding({ all: 1 }), background('#4A525A'), clipShape('capsule')]}>
            <Image systemName="mic.slash" modifiers={[font({ size: 12 }), foregroundColor(isConnected ? '#FFF' : '#4A525A')]} />
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundColor(isConnected ? '#FFF' : '#4A525A')]}>
              {isGlobalMuteActive ? "Unmute All" : "Mute All"}
            </Text>
          </HStack>
        </Button>}
      </HStack>
    </VStack>
  );

  return {
    banner: bannerLayout,
    compactLeading: (
      <HStack alignment="center" spacing={6}>
        <ZStack alignment="center">
          <VStack
            modifiers={[
              frame({ width: 26, height: 26 }),
              background(isSpeaking ? '#30D158' : '#34C759'),
              clipShape('circle'),
              ...(isSpeaking ? [shadow({ color: '#30D158', radius: 4 })] : []),
            ]}
          />
          <VStack
            modifiers={[
              frame({ width: 22, height: 22 }),
              background('#24262A'),
              clipShape('circle'),
            ]}
          />
          {activeSpeakerAvatar && activeSpeakerAvatar !== '' ? (
            <Image
              uiImage={activeSpeakerAvatar}
              modifiers={[
                frame({ width: 22, height: 22 }),
                resizable(),
                aspectRatio({ contentMode: 'fill' }),
                clipShape('circle'),
              ]}
            />
          ) : (
            <Text
              modifiers={[
                font({ size: 11, weight: 'bold' }),
                foregroundColor('#FFF'),
              ]}
            >
              {initial}
            </Text>
          )}
        </ZStack>
        <Text
          modifiers={[
            font({ size: 14, weight: 'semibold' }),
            foregroundColor('#FFF'),
          ]}
        >
          {firstName}
        </Text>
      </HStack>
    ),
    compactTrailing: isSpeaking ? (
      <Image
        systemName="waveform"
        modifiers={[
          font({ size: 16 }),
          foregroundColor('#D4AF37'),
          symbolEffect({ effect: 'variableColor', fillStyle: 'iterative', inactiveLayers: 'dim' }),
        ]}
      />
    ) : (
      <Image
        systemName={isMuted ? "mic.slash.fill" : "mic.fill"}
        modifiers={[
          font({ size: 13 }),
          foregroundColor(isMuted ? '#8E8E93' : '#30D158'),
        ]}
      />
    ),
    minimal: (
      <ZStack alignment="center">
        <VStack
          modifiers={[
            frame({ width: 22, height: 22 }),
            background(isSpeaking ? '#30D158' : '#34C759'),
            clipShape('circle'),
            ...(isSpeaking ? [shadow({ color: '#30D158', radius: 3 })] : []),
          ]}
        />
        <VStack
          modifiers={[
            frame({ width: 18, height: 18 }),
            background('#24262A'),
            clipShape('circle'),
          ]}
        />
        {activeSpeakerAvatar && activeSpeakerAvatar !== '' ? (
          <Image
            uiImage={activeSpeakerAvatar}
            modifiers={[
              frame({ width: 18, height: 18 }),
              resizable(),
              aspectRatio({ contentMode: 'fill' }),
              clipShape('circle'),
            ]}
          />
        ) : (
          <Text
            modifiers={[
              font({ size: 10, weight: 'bold' }),
              foregroundColor('#FFF'),
            ]}
          >
            {initial}
          </Text>
        )}
      </ZStack>
    ),
    expandedLeading: (
      <HStack alignment="center" spacing={8} modifiers={[padding({ leading: 8 })]}>
        <ZStack alignment="center">
          <VStack
            modifiers={[
              frame({ width: 36, height: 36 }),
              background(isSpeaking ? '#30D158' : '#34C759'),
              clipShape('circle'),
              ...(isSpeaking ? [shadow({ color: '#30D158', radius: 4 })] : []),
            ]}
          />
          <VStack
            modifiers={[
              frame({ width: 32, height: 32 }),
              background('#24262A'),
              clipShape('circle'),
            ]}
          />
          {activeSpeakerAvatar && activeSpeakerAvatar !== '' ? (
            <Image
              uiImage={activeSpeakerAvatar}
              modifiers={[
                frame({ width: 32, height: 32 }),
                resizable(),
                aspectRatio({ contentMode: 'fill' }),
                clipShape('circle'),
              ]}
            />
          ) : (
            <Text
              modifiers={[
                font({ size: 14, weight: 'bold' }),
                foregroundColor('#FFF'),
              ]}
            >
              {initial}
            </Text>
          )}
        </ZStack>
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[font({ size: 10 }), foregroundColor('#8E8E93')]}>
            {isSpeaking ? "Speaking" : "Channel"}
          </Text>
          <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundColor('#FFF')]} lineLimit={1}>
            {displayName}
          </Text>
        </VStack>
      </HStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={1} modifiers={[padding({ trailing: 8 })]}>
        <Text modifiers={[font({ size: 10 }), foregroundColor('#8E8E93')]}>
          Mic
        </Text>
        <HStack alignment="center" spacing={4}>
          <Image
            systemName={isMuted ? "mic.slash.fill" : "mic.fill"}
            modifiers={[font({ size: 12 }), foregroundColor(isMuted ? '#8E8E93' : '#30D158')]}
          />
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundColor(isMuted ? '#8E8E93' : '#30D158')]}>
            {isMuted ? "Muted" : "Live"}
          </Text>
        </HStack>
      </VStack>
    ),
    expandedBottom: bannerLayout,
  };
}

export const MyLiveActivity = createLiveActivity('MyLiveActivity', MyLiveActivityView);
