"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation/Navigation";

const ClientNavigator = () => {
    const [state, setState] = useState(false);

    useEffect(() => {
        setState(true);
    }, []);

    return ( state && <Navigation />);

};

export default ClientNavigator;