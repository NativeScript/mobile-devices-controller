echo "Killing running emulators"
for KILLPID in `ps ax | grep 'emulator' | grep -v 'grep' | awk ' { print $1;}'`; do kill -9 $KILLPID; done
for KILLPID in `ps ax | grep 'qemu' | grep -v 'grep' | awk ' { print $1;}'`; do kill -9 $KILLPID; done
for KILLPID in `ps ax | grep 'adb' | grep -v 'grep' | awk ' { print $1;}'`; do kill -9 $KILLPID; done